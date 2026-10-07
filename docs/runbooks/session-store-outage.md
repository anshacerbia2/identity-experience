# Runbook: Session-Store Outage

The BFF's session store is its own PostgreSQL database (`TDD-identity-experience-001` §Server-Side
Session). Every signed-in request reads it. This runbook is for when it cannot be reached or answers
errors.

## What the BFF does

- **It keeps running.** The pool connects on first use (`bff/src/server.ts`), so a process whose
  database is down still starts, serves the applications' pages and answers `/healthz` with `200`.
- **`/healthz` is liveness only.** It does not touch the database. An orchestrator does not restart
  or remove a replica for a store outage, which is right: a restart does not fix the store.
- **Every request that needs a session fails with `500`.** A query error in `Sessions.resolve` is not
  classified, so it reaches the error handler and answers the `internal` problem document with a
  `correlation_id`. That covers `/api/*`, `/auth/session`, `/auth/login`, `/auth/callback` and
  `/auth/logout`. The browser shows the request failed; nobody is signed out.
- **No session is lost.** Rows stay in PostgreSQL. A refresh that fails on the store keeps the session:
  only a refusal by the identity kernel ends one (`Sessions.fresh`).
- **Expiry keeps its clock.** Idle and absolute expiry are timestamps in the row. A session idle for
  more than 30 minutes during the outage is refused when the store returns, and its holder signs in
  again. That is intended.
- **Back-channel logouts are refused while it lasts.** `/auth/back-channel-logout` cannot delete rows,
  answers `500`, and Keycloak need not resend it (OpenID Connect Back-Channel Logout 1.0 §2.5 [R1]). The
  refresh path still ends those sessions within four minutes once the store is back. See
  [back-channel logout failure](back-channel-logout-failure.md).

## Signals

| Log line (`msg`) | Level | Meaning |
| :-- | :-- | :-- |
| `session store connection failed` | error | The pool lost a connection (`pool.on('error')`) |
| `request failed` | error | A request ended in `500`; its `err` names the database error |
| `expired session purge failed` | warn | The five-minute purge could not run |

The operational table in TDD-001 adds session-store latency against the proxy budget.

## Steps

1. **Confirm it is the store.** Take a `correlation_id` from a failed request and find its
   `request failed` line. A `pg` error (`ECONNREFUSED`, `ETIMEDOUT`, `57P01 admin_shutdown`,
   `53300 too_many_connections`) is this runbook. Anything else is not.
2. **Check the database itself**, from where the BFF runs, as the serving role:
   `pg_isready -d "$IDENTITY_EXPERIENCE_DATABASE_URL"`. Check its disk, its connection count, and
   whether a failover moved its address.
3. **Do not restart the BFF to fix it.** Restarting changes nothing while the store is down, and drops
   in-flight requests. Restart only if the store's address changed and the configuration was updated.
4. **Do not point the BFF at an empty database to get people working.** The BFF runs no DDL
   (`TDD-identity-experience-001` §Server-Side Session). An empty database has no tables, and every
   request keeps failing.
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
- No new `request failed` lines carry a `pg` error.
- The purge runs again: no `expired session purge failed` for ten minutes.

## Known gap

A store failure answers `500 internal`, not `503 dependency-unavailable` as a kernel outage does. The
browser cannot tell "try again" from "this is broken". Changing it touches `bff/src/http/authenticate.ts`
and `bff/src/auth/routes.ts`, which `organization-experience` keeps identical
(`bff/conformance.json` there), so it is a change to make in both, not here alone.

## References

| Ref | Source |
| :-- | :-- |
| R1 | OpenID Foundation, *OpenID Connect Back-Channel Logout 1.0*, §2.5 and §2.8, <https://openid.net/specs/openid-connect-backchannel-1_0.html>, accessed 2026-10-07: "The OP should not retransmit a Back-Channel Logout Request unless the OP suspects that previous transmissions may have failed due to potentially recoverable errors." "If the logout request was invalid or the logout failed, the RP MUST respond with HTTP 400 Bad Request." |
