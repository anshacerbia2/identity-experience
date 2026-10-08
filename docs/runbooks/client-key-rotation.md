# Runbook: Client Key Rotation

The BFF is a confidential client. It signs a PS256 client assertion (`private_key_jwt`) with its own
private key at the token endpoint and the logout endpoint (`TDD-identity-experience-001`, ADR-IAM-001
§5.12). The client has no secret. This runbook replaces that key: on schedule, ahead of its expiry,
or because it has leaked.

## What the BFF does with its key

- It reads one PEM file at start, `IDENTITY_EXPERIENCE_CLIENT_KEY_FILE`, and refuses to start on a
  file that is missing, unreadable, not RSA, or below 3072 bits. The message names the problem and
  never the key (`bff/src/config.ts`, `bff/src/auth/client-key.ts`).
- Its `kid` is the key's RFC 7638 thumbprint, computed from the key. Nothing else is configured to
  agree with it.
- **It reads the file only at start.** A new file takes effect when the process restarts, one replica
  at a time.
- Signing in and signing out need the key. A session already open does not, until its next refresh,
  which also authenticates with it. So a key the kernel stops accepting fails every sign-in, and every
  refresh within four minutes. A refused refresh ends the session (`Sessions.fresh`).

## What identity-control does with the public half

The BFF's client is a registration (`TDD-identity-control-003` §Client Key Records, §Client Key
Rotation):

- A registration holds one `active` key and at most one `retiring` key.
- Registering the next public key makes it `active` and the previous one `retiring` for
  `IDENTITY_CLIENT_KEY_ROTATION_OVERLAP`, seven days by default. The kernel accepts both meanwhile.
- A retiring key is removed on schedule after its overlap; any key is removed after its `expires_at`.
- Revoking a key removes it from the kernel at once, with a reason.

## Planned rotation

1. **Make the next key on a trusted machine,** under a new name. A key is never overwritten:

   ```sh
   node scripts/new-client-key.mjs identity-experience-bff-next
   ```

   `keys/identity-experience-bff-next.pem` stays there. `keys/identity-experience-bff-next.jwk.json`
   is the public half and is not secret.
2. **Register the public half.** An owner of the BFF's registration, in the Developer Console, or a
   provider, in the Admin Portal: the registration's page, Keys, rotate, paste the JWK. It is
   `POST /v1/registrations/{registration_id}/keys` with `{"public_key": …}`. The page shows the old key
   as retiring and the time its overlap has left.
3. **Install the private key** in the approved secret manager under the path
   `IDENTITY_EXPERIENCE_CLIENT_KEY_FILE` mounts, and restart the replicas one at a time.
4. **Verify on each replica:** sign in, call one API page, sign out. A sign-in that lands on
   `?sign-in=failed` with `the authorization response or its tokens were refused` in the log means the
   kernel refused the assertion: the new public key is not on the client.
5. **Let the old key retire.** Do nothing: identity-control removes it when the overlap ends. Revoke it
   sooner, with a reason, only once every replica runs the new key.
6. **Destroy the old private key** on the machine and in the secret manager.

Do it well inside the overlap. A replica still on the old key when the overlap ends fails every
sign-in and, within four minutes, every refresh.

## A key that has leaked

OWASP's key management guidance: "Revoke compromised keys promptly and stop using them to protect new
data" [R1]. A leaked key lets anyone authenticate as the BFF at the token endpoint, but not use a
session: they still need a code issued to this client's redirect URI, or a refresh token, which only
the session store holds, sealed.

1. Make and register the next key, steps 1 and 2 above.
2. Install it and restart every replica, steps 3 and 4. Do it at once, not one by one over hours.
3. **Revoke the leaked key now,** with the reason, from the registration's Keys panel
   (`POST /v1/registrations/{registration_id}/keys/{key_id}:revoke`). Do not wait for the overlap.
4. If the replicas cannot be moved first, revoke anyway. Sign-in stops until they move, and open
   sessions end at their next refresh. An outage of the administrative applications is the
   containment wanted (`TDD-identity-control-003` §Client Key Rotation).
5. Read the kernel's events for this client's token requests since the key may have leaked, and treat any you cannot account for as an incident.

## The session key is not this key

`IDENTITY_EXPERIENCE_SESSION_KEY` seals the tokens in the session store. It is not a client key, and it
is not rotated by this runbook. Changing it makes every stored session unreadable: each person is
signed out at their next request and signs in again, and nothing answers `500`
([session-store outage](session-store-outage.md) §Not the store). Rotate it together with emptying the
store, as [suspected session fixation](suspected-session-fixation.md) describes.

## References

| Ref | Source |
| :-- | :-- |
| R1 | OWASP, *Key Management Cheat Sheet*, <https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html>, accessed 2026-10-07: "Revoke compromised keys promptly and stop using them to protect new data." On cryptoperiods: "Private signing keys typically have an originator cryptoperiod of 1 to 3 years." |
