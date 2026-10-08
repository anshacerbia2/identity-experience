# BFF Runbooks

The four runbooks `TDD-identity-experience-001` §Operational Notes requires before production. Each
says what the BFF does in the failure, as the code does it today, how to see it, and what to do.

| Runbook | Starts from |
| :-- | :-- |
| [Session-store outage](session-store-outage.md) | `session store connection failed` or `session store unavailable` errors; every signed-in request answers 503 |
| [Back-channel logout failure](back-channel-logout-failure.md) | A Keycloak session removed with no `back-channel logout` line, or `back-channel logout refused` warnings |
| [Client key rotation](client-key-rotation.md) | A planned rotation, a key expiry warning, or a key that has leaked |
| [Suspected session fixation](suspected-session-fixation.md) | A report or a signal that someone acts in another person's session |

Why runbooks at all. Google's SRE practice: "Playbooks contain high-level instructions on how to
respond to automated alerts. They explain the severity and impact of the alert, and include debugging
suggestions and possible actions to take to mitigate impact and fully resolve the alert", and "These
guides reduce stress, the mean time to repair (MTTR), and the risk of human error" [R1].

**Two rules hold in every runbook.**

- Never run a service stack on a shared server to try something. Reproduce in the repository's CI or
  on a developer's machine.
- Never paste a token, a cookie value, the session key or a private key into a ticket, a chat or a log
  query. The BFF never logs one; a runbook step never asks for one.

**Where the facts come from.** Every behaviour stated is the code's at the commit that added these
runbooks: `bff/src/server.ts`, `bff/src/http/authenticate.ts`, `bff/src/session/*.ts`,
`bff/src/auth/routes.ts` and `bff/src/auth/oidc.ts`. When the code changes, the runbook changes in the
same pull request.

## References

| Ref | Source |
| :-- | :-- |
| R1 | Google, *The Site Reliability Workbook*, ch. 8 "On-Call", <https://sre.google/workbook/on-call/>, accessed 2026-10-07: "Playbooks contain high-level instructions on how to respond to automated alerts. They explain the severity and impact of the alert, and include debugging suggestions and possible actions to take to mitigate impact and fully resolve the alert." "These guides reduce stress, the mean time to repair (MTTR), and the risk of human error." |
