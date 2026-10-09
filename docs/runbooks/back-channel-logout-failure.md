# Runbook: Back-Channel Logout Failure

Keycloak tells the BFF that one of its sessions ended by posting a signed logout token to
`POST /auth/back-channel-logout` (OpenID Connect Back-Channel Logout 1.0). It is the fast path by
which a revocation reaches an open tab (`TDD-identity-experience-001` §How a Revocation Reaches an
Open Tab). This runbook is for when it does not arrive, or arrives and is refused.

## What is at stake, and what is not

A lost notification does not keep a revoked person in. Two other paths end the session on their own:

- **The refresh path.** The BFF refreshes the access token when it is within 30 seconds of expiry. A
  Keycloak session that is gone refuses the refresh, and the BFF destroys the session
  (`Sessions.fresh`). So a session outlives its Keycloak session by at most the remaining lifetime of
  the access token it holds: four minutes at lifetime class `L0`. `bff/test/containment.test.ts`
  ("the revocation bound") proves the bound with no back-channel logout delivered.
- **The API.** A `401` from the Identity Control API, other than a step-up challenge, destroys the
  session at once (`bff/src/api/proxy.ts`).

The absolute expiry, eight hours, ends every session whatever else fails.

What a lost notification costs is those four minutes. For an ordinary sign-out that is acceptable. For
a person removed because of a compromise it may not be, and step 5 closes it by hand.

## What the BFF does with a notification

- It verifies the token as §2.6 of the specification asks: a PS256 signature by a realm key, the
  issuer, the client as audience, `iat` and `jti` present, an age under two minutes, the logout event,
  no `nonce`, and a `sid` or a `sub` (`Oidc.verifyLogoutToken`).
- It deletes the sessions of that Keycloak session (`sid`), or of the subject when no `sid` is given,
  and logs `back-channel logout` with how many it `ended`. It answers `200`.
- A refused token answers `400` and logs `back-channel logout refused` with the reason in `err`.
  §2.8: "If the logout request was invalid or the logout failed, the RP MUST respond with HTTP 400 Bad
  Request" [R1].
- A store that does not answer is a logout that failed, and answers `400` too. It logs
  `back-channel logout could not reach the session store` ([session-store outage](session-store-outage.md)).
- The route answers on any host name, because Keycloak reaches the BFF on an internal address
  (`bff/src/http/canonical-host.ts`), and it carries no CSRF check: no browser is involved.

## Signals

| Signal | Meaning |
| :-- | :-- |
| A Keycloak session removed (an admin event or `LOGOUT` event) with no `back-channel logout` line within a minute | Not delivered: steps 1–3 |
| `back-channel logout refused` warnings | Delivered and refused: step 4 |
| `back-channel logout` with `ended: 0` | Delivered, valid, and the session was already gone, or belongs to another replica's database: check the BFF's `IDENTITY_EXPERIENCE_DATABASE_URL` is the shared store |
| A rise in refresh refusals (`refresh refused; the session is destroyed`) | The refresh path doing the work the notification did not; correlate with revocations before treating it as an incident |

TDD-001 §Operational Notes sets "back-channel logout not received for a removed Keycloak session" as a
warning on any occurrence.

## Steps

1. **Is a back-channel logout URL registered on the BFF's client?** Read the BFF's registration in
   the Admin Portal, or `GET /v1/registrations/{registration_id}`: it names `backchannel_logout_uri`
   when one is registered. It must be the BFF's `/auth/back-channel-logout` on an address Keycloak can
   reach. On a developer's machine none is registered, by design: Keycloak cannot reach the laptop
   (`ADR-IAM-009 §5.3`, `README.md`). On a server, the registration or the adoption names it
   (`deploy/dev/README.md`, step 2), and identity-control writes it on the kernel client with
   front-channel logout off (`TDD-identity-control-003` 1.37.0). A URI is not changed after
   registration yet: a wrong one is corrected by registering the client again. Never set it in the
   Admin Console: the drift sweep reads a console change as a `logout` finding and puts the registered
   value back.
   Also check that front-channel logout is off on the client: Keycloak 26.7.5 sends no back-channel
   logout to a client with front-channel logout on (`ADR-IAM-009` [R4]). The sweep records it as a
   `logout` finding, and repairs it when an admin event names who turned it on.
2. **Can Keycloak reach it?** From the kernel's network, post an empty form to the URL. A `400` with
   `A logout_token form parameter is required` means the route is reached. A timeout, a TLS error or a
   `404` is the network or the address.
3. **Did Keycloak try?** Read the kernel's server log around the removal for the failed request. Do
   not count on a later retry: the specification does not require one, "The OP should not
   retransmit a Back-Channel Logout Request unless the OP suspects that previous transmissions may have
   failed due to potentially recoverable errors" (§2.5) [R1].
4. **Refused tokens.** Read the `err` of `back-channel logout refused`:
   - a signature error after the realm rotated its keys: the BFF fetches the realm's keys by `kid`, so
     a new key is found on the next token; persistent failures mean the BFF reaches another realm's
     JWKS than the issuer's, so check `IDENTITY_EXPERIENCE_KEYCLOAK_INTERNAL_URL`;
   - `iat` too old or in the future: the clocks of the kernel and the BFF disagree by more than two
     minutes. Fix the time source; do not widen the window. §4 asks for short-lived logout tokens so a
     captured one cannot be replayed [R1];
   - an audience error: the client id the BFF is configured with (`IDENTITY_EXPERIENCE_CLIENT_ID`) is
     not the client Keycloak signed for.
5. **Close the window for one person now.** When a removal cannot wait four minutes:
   - end their Keycloak sessions through the Identity Control API: the Admin Portal's Principal page,
     "End every session" (`POST /v1/principals/{principal_id}/sessions:terminate-all`);
   - then delete their BFF sessions as the serving role:
     `DELETE FROM sessions WHERE subject = '<keycloak subject>'`. The next request from that browser
     answers `401`.

## Verify

- Sign in on a test account, end its session in the kernel, and see the `back-channel logout` line with
  `ended: 1` within seconds.
- Or, with the URL still missing, see the session end at its next refresh, within four minutes.

## References

| Ref | Source |
| :-- | :-- |
| R1 | OpenID Foundation, *OpenID Connect Back-Channel Logout 1.0*, <https://openid.net/specs/openid-connect-backchannel-1_0.html>, accessed 2026-10-07. §2.5: "The OP should not retransmit a Back-Channel Logout Request unless the OP suspects that previous transmissions may have failed due to potentially recoverable errors." §2.8: "If the logout succeeded, the RP MUST respond with HTTP 200 OK." "If the logout request was invalid or the logout failed, the RP MUST respond with HTTP 400 Bad Request." §4: "OPs are encouraged to use short expiration times in Logout Tokens, preferably at most two minutes in the future, to prevent captured Logout Tokens from being replayable." |
