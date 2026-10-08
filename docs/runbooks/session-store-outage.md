# Runbook: Session-Store Outage

The BFF's session store is its own PostgreSQL database (`TDD-identity-experience-001` §Server-Side
Session). Every signed-in request reads it. This runbook is for when it cannot be reached or answers
errors.

## What the BFF does

- **It keeps running.** The pool connects on first use (`bff/src/server.ts`), so a process whose
  database is down still starts, serves the applications' pages and answers `/healthz` with `200`.
- **`/healthz` is liveness only.** It does not touch the database. An orchestrator does not restart
  or remove a replica for a store outage, which is right: a restart does not fix the store.
- **Every request that needs a session answers `503`.** The store names what the driver throws
  (`SessionStore`, `isStoreOutage`): a refused, dropped or timed-out connection, or a server error of
  SQLSTATE class `08` connection exception, `53` insufficient resources, `57` operator intervention or
  `58` system error. That is `SessionStoreUnavailable`, and the BFF answers it as it answers an
  identity kernel that does not answer (`TDD-identity-experience-001` §Session-Store Outage):
  - `/api/*`, `/auth/session` and `/auth/logout` answer `503` with the `dependency-unavailable`
    problem document and a `correlation_id`. Nothing reaches the Identity Control API.
  - `/auth/login` and `/auth/callback` are navigations, so they land on the application's root with
    `?sign-in=unavailable`. The application says the sign-in could not be completed and offers to try
    again.
  - No `Retry-After` is sent. RFC 9110 §15.6.4 makes it optional, and the BFF does not know how long
    the store will be down [R2].
  - Nobody is signed out. The cookie is not cleared, so the same request works once the store answers.
- **Any other database error is still `500 internal`.** A missing table (`42P01`, an empty database)
  or a refused login (`28P01`, a wrong password) is a fault in the deployment, not an outage, and logs
  `request failed`.
- **No session is lost.** Rows stay in PostgreSQL. A refresh that fails on the store keeps the session:
  only a refusal by the identity kernel ends one (`Sessions.fresh`).
- **Expiry keeps its clock.** Idle and absolute expiry are timestamps in the row. A session idle for
  more than 30 minutes during the outage is refused when the store returns, and its holder signs in
  again. That is intended.
- **Back-channel logouts are refused while it lasts.** `/auth/back-channel-logout` cannot delete rows
  and answers `400`, as OpenID Connect Back-Channel Logout 1.0 §2.8 requires of a logout that failed.
  Keycloak need not resend it (§2.5 [R1]). The refresh path still ends those sessions within four
  minutes once the store is back. See [back-channel logout failure](back-channel-logout-failure.md).

## Signals

| Log line (`msg`) | Level | Meaning |
| :-- | :-- | :-- |
| `session store connection failed` | error | The pool lost a connection (`pool.on('error')`) |
| `session store unavailable` | error | A request answered `503`; its `err.cause` names the driver's error |
| `sign-in could not reach the session store` | error | A sign-in landed on `?sign-in=unavailable` |
| `back-channel logout could not reach the session store` | error | A logout notice was answered `400` and lost |
| `expired session purge failed` | warn | The five-minute purge could not run |
| `request failed` | error | A request ended in `500`: a database error that is not an outage, so not this runbook |

The operational table in TDD-001 adds session-store latency against the proxy budget.

## Steps

1. **Confirm it is the store.** Take a `correlation_id` from a `503` and find its
   `session store unavailable` line. Its `err.cause` is the driver's error (`ECONNREFUSED`,
   `ETIMEDOUT`, `57P01 admin_shutdown`, `53300 too_many_connections`). A `503` whose line is
   `refresh could not reach the identity kernel` is the kernel, not the store.
2. **Check the database itself**, from where the BFF runs, as the serving role:
   `pg_isready -d "$IDENTITY_EXPERIENCE_DATABASE_URL"`. Check its disk, its connection count, and
   whether a failover moved its address.
3. **Do not restart the BFF to fix it.** Restarting changes nothing while the store is down, and drops
   in-flight requests. Restart only if the store's address changed and the configuration was updated.
4. **Do not point the BFF at an empty database to get people working.** The BFF runs no DDL
   (`TDD-identity-experience-001` §Server-Side Session). An empty database has no tables, and every
   request fails with `500` instead.
5. **Restore the store.** When it answers again, the BFF recovers without a restart: the pool
   reconnects on the next request.
6. **If the data is lost**, recreate the database, run the migration as the owning role
   (`pnpm --filter @identity-experience/bff migrate`, with `IDENTITY_EXPERIENCE_MIGRATION_DATABASE_URL`
   and `IDENTITY_EXPERIENCE_RUNTIME_ROLE`), and tell people to sign in again. Nothing else is lost: the
   store holds sessions only, and no business state.
7. **Revocations during the outage.** List the Principals whose access was revoked while the store was
   down. Their Keycloak sessions are already gone, so their next request after recovery refreshes,
   is refused, and ends the session. For one that cannot wait, delete its rows once the store answers:
   `DELETE FROM sessions WHERE subject = '<keycloak subject>'` as the serving role.

## Verify

- `/auth/session` answers `200` with `{"authenticated":true,…}` for a signed-in browser.
- No new `session store unavailable` lines, and no `request failed` line carries a `pg` error.
- The purge runs again: no `expired session purge failed` for ten minutes.

## Not the store: a changed session key

A row sealed under another `IDENTITY_EXPERIENCE_SESSION_KEY` does not open. The BFF treats it as no
session: `/api/*` answers `401` and clears the cookie, `/auth/session` answers
`{"authenticated":false}`, and the person signs in again. It logs
`session unreadable under the session key; treated as signed out` at `warn`, and nothing answers
`500`. The row stays until the purge removes it at its expiry: a replica holding a wrong key must not
delete the sessions the others can read. Many such lines after a deployment mean the key changed. If
that was not intended, put the old value back: the sessions open again. See
[suspected session fixation](suspected-session-fixation.md) for a key changed on purpose.

## References

| Ref | Source |
| :-- | :-- |
| R1 | OpenID Foundation, *OpenID Connect Back-Channel Logout 1.0*, §2.5 and §2.8, <https://openid.net/specs/openid-connect-backchannel-1_0.html>, accessed 2026-10-07: "The OP should not retransmit a Back-Channel Logout Request unless the OP suspects that previous transmissions may have failed due to potentially recoverable errors." "If the logout request was invalid or the logout failed, the RP MUST respond with HTTP 400 Bad Request." |
| R2 | IETF RFC 9110, *HTTP Semantics*, §15.6.4, <https://www.rfc-editor.org/rfc/rfc9110#section-15.6.4>, accessed 2026-10-08: "The 503 (Service Unavailable) status code indicates that the server is currently unable to handle the request due to a temporary overload or scheduled maintenance, which will likely be alleviated after some delay. The server MAY send a Retry-After header field (Section 10.2.3) to suggest an appropriate amount of time for the client to wait before retrying the request." |
