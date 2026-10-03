# Identity Experience — Roadmap

Execution tracker for this repository only. Architecture lives in
`scnehaux-architecture`; nothing here overrides a SAD, an ADR, or a standard.

Week numbers are relative to the first build week, not calendar dates.

## Position in the build order

This repository starts **after** `identity-control` has a Principal API to call and
`identity-kernel` has a realm to authenticate against. Building the BFF against nothing
produces a session pattern nobody has exercised.

The BFF lands before any application screen. Every screen depends on it, and a session
pattern retrofitted after three applications exist is a session pattern that will be
worked around.

## Design status

| TDD                           | Subject                                                            | Status   |
| :---------------------------- | :----------------------------------------------------------------- | :------- |
| `TDD-identity-experience-001` | Backend-for-frontend session and browser security                  | approved |
| `TDD-identity-experience-002` | Account security: sessions, devices, authenticators, consent       | approved |
| `TDD-identity-experience-003` | Identity administration and investigation                          | approved |
| `TDD-identity-experience-004` | Developer console: application onboarding and client key lifecycle | approved |

## Build decisions, 2026-09-28

Taken with the repository owner before the first line of code:

| Decision            | Choice                                                                 | Why                                                                                                                                                                                                                                               |
| :------------------ | :--------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BFF runtime         | TypeScript on Node.js, Fastify                                         | SAD-002 §3 fixes TypeScript for every container here; TDD-001 §Runtime                                                                                                                                                                            |
| Browser application | Vite + React 19, rendered in the browser                               | STD-GLB-FE-001 §3 requires client-side rendering for authenticated admin portals; ADR-GLB-FE-003 (meta-framework) keeps Next.js for SSR/SEO needs this console does not have                                                                      |
| Next.js             | not used                                                               | Its server rendering buys nothing behind a login. Its inline hydration scripts would force a nonce-based policy where TDD-001 has `script-src 'self'`, and its server actions and middleware add request paths the BFF would have to prove closed |
| Session store       | PostgreSQL                                                             | TDD-001 §Server-Side Session: shared across replicas, survives restarts, no second persistence technology                                                                                                                                         |
| Router              | TanStack Router                                                        | Typed search parameters, for the URL-held state STD-GLB-FE-001 §3 requires                                                                                                                                                                        |
| Styling             | SCSS Modules, cascade layers, OKLCH, logical properties                | STD-GLB-FE-005 §3.1–3.3                                                                                                                                                                                                                           |
| Components          | `packages/ui`, a local stand-in for `@scnx/core-ui` and `@scnx/system` | The UI Platform is still being built; see the exception below                                                                                                                                                                                     |

**Open: the UI Platform exception.** SAD-002 §10 rejects bypassing the UI Platform without an
approved exception. STD-GLB-FE-005 §3.5 makes applications consumers of its token pipeline. The
owner chose to build first and write the exception later, so both are knowingly departed from until
it exists. `packages/ui` is built to make the departure cheap to end:

- it mirrors the platform's component APIs and its `--ds-*` token names;
- applications import it through one entry point.

Its README maps each component to its platform counterpart.

**Corrected in TDD-001 1.1.0.** The content security policy named only `script-src` and
`connect-src`, so `default-src 'none'` would have refused the application's own stylesheets and
fonts. It now names each directive. The runtime and the session store are stated.

**Changed in TDD-001 1.2.0.** Sign-out ends the Keycloak session server-side instead of
redirecting the browser through RP-initiated logout, which would have put the ID token in a URL the
browser holds. The ID token is validated at sign-in and not kept. A login binding cookie ties the
callback to the browser that started it. A refresh that cannot reach Keycloak keeps the session
and answers 503; only a refusal ends it. The session table, the configuration and the tests are
stated as built.

## Week 1 · The BFF

**Done, foundation:** the workspace, the BFF serving the built application under every
security header of TDD-001, and RFC 7807 problem documents. The admin application's shell and
first page are built on `packages/ui`, with EN and ID messages. CI runs format, typecheck,
ESLint, stylelint, module boundaries, tests, a build check for inline code and bundled secrets,
and a dependency audit.

**Done, sign-in:** every item below, against a PostgreSQL session store and a PS256-signing
stand-in for the realm, in CI. The admin shell signs in, shows who is signed in, and signs out.
**Next:** signing in against the real realm. `deploy/dev/create-bff-client.sh` creates the
confidential client `identity-experience-bff` on the dev server, once, and `scripts/dev-local.ps1`
runs the BFF on a developer's machine against it, with no Docker. The laptop side is verified up to
the authorization request: the issuer matches, the realm publishes a PS256 key, and the token
endpoint answers.

✅ **The BFF authenticates with its own key** (TDD-001 1.4.0, `ADR-IAM-001 §5.12`). It signs a
PS256 client assertion with its private key, through `openid-client`'s `PrivateKeyJwt` for the token
endpoint and `jose` for the logout endpoint. The key is made on the developer's machine by
`scripts/new-client-key.mjs`, and only its public half goes to the server. The client has no secret.
The stand-in kernel in the tests refuses a secret, a replayed assertion, and a key other than the
registered one.

**Owed to identity-control.** `identity-experience-bff` is created by a script, not registered.
identity-control's registration API builds public and resource clients only. A confidential client
needs client key registration, which is designed (TDD-identity-control-003 §Client Key Records) and
not built. Before identity-control starts disabling unmanaged clients, this client must be
registered, or it is disabled with every session it holds.

- Authorization code exchange with PKCE `S256`, confidential client authentication
- `state` and `nonce` generated, stashed, and validated on return
- ID token validation: issuer, audience, nonce, signature, expiry
- Server-side session store, shared across replicas
- `__Host-` session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, opaque value
- Three independent cross-site request forgery defences
- Server-side refresh, with failure destroying the session
- Idle and absolute expiry

**Exit:** no response body, header, or built artifact contains a token, client secret, or private key,
asserted by scanning every endpoint; a cross-site form post carrying the session cookie
is rejected.

## Week 2 · Revocation reaching the browser

**Done early, with sign-in:** the back-channel logout receiver, a 401 from the Identity Control
API destroying the session, and sign-out ending the Keycloak session. Step-up followed
identity-control#61 (TDD-001 1.8.0 §Step-Up): a `401 insufficient_user_authentication` keeps the
session and reaches the application, which offers a sign-in with the challenge's `max_age`, and the
callback refuses an `auth_time` older than it.
The challenge's level followed ADR-IAM-004 (TDD-001 1.10.0):

- `acr_values` passes to `/auth/login`, and the callback refuses an `acr` below it.
- A sign-in returning to the Admin Portal asks for `aal2` by default.
- A read challenged for its level offers the same sign-in.

**Next:** the measured exit below.

- Back-channel logout receiver, destroying the matching session and no other
- 401 from the Identity Control API destroying the session
- Front-channel logout and global sign-out
- Step-up: reading the requirement from the API, driving the ceremony, never granting
  assurance locally

**Exit:** measured time from Membership revocation to session destruction stays within
the remaining access token lifetime of class `L0`; a lost back-channel notification does
not extend it, because the refresh path bounds it independently.

## Week 3 · Account security

**Started** on identity-control's TDD-005 slice 3a (TDD-002 1.2.0 §As Built). `apps/account` is served under `/account/`:

- A person's sessions, with this browser marked. Ending one says the device keeps access for at most four minutes.
- "Sign out everywhere" asks for a confirmation, then also signs this browser out.
- Their authenticators: remove under step-up, with the API's `last_authenticator` refusal rendered.

The shared frame links to it from the Portal and the console. Enrolling an authenticator app followed identity-control's slice 4a (TDD-002 1.3.0, TDD-001 1.11.0):

- the API authorizes the enrollment at its level;
- the BFF passes `kc_action=CONFIGURE_TOTP` from its allowlist;
- the kernel's page enrolls the app;
- the outcome comes back as `kc_action_status`.

A provider's refused removal of their last second factor is shown with its sentence. **Next:** consents once the API's slice 3b exists, WebAuthn with slice 4b, and recovery entry points.

- Session and device inventory with termination
- Authenticator enrollment, replacement, and removal
- Consent inventory and withdrawal
- Recovery entry points, handing off to the kernel-rendered pages

**Exit:** every destructive action is reauthorized by the Identity Control API and
carries an idempotency key, an optimistic version, and a reason.

## Week 4 · Administration and developer console

**Started early, with the first real sign-in:** registrations and drift (TDD-003 1.4.0, §Registration
Drift Oversight). The list is paged by identity-control's new `GET /v1/registrations` cursor
(identity-control#19). It shows each client's open findings, the reconciler's last run, and one
registration with every finding and its convergence time. The operator actions followed: run a sweep, apply the registered state to a finding with a reason, and
grant a drift exception. Each registration also lists its drift exceptions, in force or expired
(TDD-003 1.5.0, on identity-control#20's `GET` of the same path). Principals followed (§Principal Provisioning and Portability): create a person, and relink a mapping whose Keycloak user is gone. Workloads followed identity-control#26 (§Workloads, TDD-003 1.6.0): create one with its public key, find one by `principal_id`, and reassign it with a reason. Creating a workload moved off the Principal form, which identity-control now refuses for workloads, because a workload's Keycloak user is its client's service account. The registration lifecycle followed identity-control#29 (ADR-IAM-001 §5.13, TDD-003 1.7.0): suspend an active client, restore or retire a suspended one, and retire an active resource, each with a reason; a retirement asks for the `client_key` typed out, and a workload's client is offered nothing. Apply is no longer offered on a suspended registration, and the drift summary counts the Keycloak clients no registration describes (identity-control#28), whose findings name no registration. The `client_keys` and `suspension` field classes are shown as words. The BFF signs in with `openid scnehaux-provider scnehaux-profile` and reads the name it shows from the ID token alone (TDD-001 1.5.0 §Sign-In Scopes, STD-IAM-002 §3.2): the access token carries no name. It is deployed after the BFF's client holds `scnehaux-profile`, which identity-control#30 registers and an operator's apply gives a client adopted before it. The page then lists each unmanaged client by `clientId`, with whether it is enabled, the Keycloak user its admin event names, and its times (TDD-003 1.8.0); adoption keeps no screen, by decision, and runs through identity-control's `:adopt` with a dry run first. Workloads followed identity-control#33 (TDD-003 1.9.0 §Workloads): an active or orphaned workload is suspended, and a suspended one restored or retired, each with a reason; a retirement asks for the `client_key` typed out, and a restore the API refuses because the owner has left is shown with its sentence. The page also lists the clients whose key is about to expire, from identity-control#34's warning (TDD-003 1.10.0): a key ending within 14 days with no successor, within 3, or no key at all, each linked to its registration; the remedy, the client's own rotation, is the Developer Console's. A keyed registration's page lists its keys, with state, thumbprint, dates and a retiring key's time left, and an operator rotates to the next public key the team pastes or revokes one with a reason (TDD-003 1.11.0), on the team's behalf until the Developer Console has an authority model of its own. Search and security state followed identity-control#59 and #61 (TDD-003 1.18.0 §Principal Search and Security State):

- The Principals page searches by the beginning of a username or email and lists nothing until asked.
- A Principal's page reads its summary, then sessions, authenticators, federation links and findings, each only when opened.
- It suspends, restores, ends every session and revokes an authenticator only where the API accepts it, never on the operator's own Principal. The last first factor is never offered for revocation.
- Each command follows a `202` to its final state. **Next:** connecting the laptop BFF to identity-control so
  these screens read real data.

The Developer Console started (TDD-004 1.3.0 §Delivery, §Ownership): `apps/developer`, served by
the same BFF under `/developer/` with the same session (TDD-001 1.6.0), lists the registrations the
signed-in person owns, from identity-control#35's `GET /v1/registrations:mine` (ADR-IAM-003). Both
applications take API access, the session, preferences, the frame every page renders in, and the
registration domain from `packages/app-core`. A sign-in that does not complete now lands on the
application it started from. Each owned registration then has its page (TDD-004 1.4.0): its
record, its keys rotated and revoked by an owner, suspend and restore with a reason, and its
active owners. The record, the key panel and the lifecycle controls are the Admin Portal's,
moved into `packages/app-core`; an owner is offered no retirement. Redirect URIs then change by a
change identity-control#36 records (TDD-004 1.5.0 §Redirect URI Changes, TDD-003 1.13.0 §Change
Approval): an owner proposes the whole next set with a reason, and withdraws it. Outside production
it applies at once. In production a provider other than the proposer approves or rejects it, on the
registration's page or in the portal's approval queue, where each change shows its before and
after as proposed. A provider grants application developer standing on the Principals page
(TDD-003 1.14.0), and an application developer registers a non-production client or resource from
the console and becomes its first owner (TDD-004 1.6.0 §Registering a Client, identity-control#37
and #38). Registration is offered only where `GET /v1/registrations:standing` says the API accepts
it, and the form offers only what a developer may register. In production the same form requests
the client, naming at least two owners (TDD-004 1.7.0, identity-control#39): the console lists the
person's requests and withdraws an open one, and the portal's Approvals page lists every request
with its document and owners, for a provider other than the requester to approve or reject
(TDD-003 1.15.0). **Next:** audience and lifetime-class changes.

- Identity administration and investigation surfaces
- Application and client onboarding, redirect and audience configuration
- Client public-key registration and rotation flow (TDD-004 1.2.0)
- Privileged action reason and evidence capture

**Exit:** no administrative control is available in the interface that the Control API
would refuse, and no control the API permits is hidden without a stated reason.

## Depends on

| Repository             | What this needs from it                                                                   |
| :--------------------- | :---------------------------------------------------------------------------------------- |
| `identity-kernel`      | Hosted login, realm configuration, back-channel logout registration, step-up `acr` values |
| `identity-control`     | The Identity Control API, which reauthorizes every command                                |
| `scnehaux-ui-platform` | Design system packages, build-time only                                                   |

The context switch mechanism is decided in `identity-kernel` and consumed here. The
baseline is a fresh authorization request on the existing SSO session — a redirect
round trip, not a credential prompt. If Standard Token Exchange proves viable without
an extension, only the BFF's switch handler changes.

## Not this repository

Recorded so scope creep is visible rather than convenient:

- Hosted login, MFA enrollment, and recovery pages — `identity-kernel` theme.
- Any authorization decision — the Identity Control API.
- Organization, Tenant, Workspace, and Membership administration —
  `organization-experience`.
- Business state and domain logic of any kind.

## Gates

**Design gate.** All four designs at `1.0.0`.

**Production gate.** The design gate, plus: token containment proven by scanning every
response and the built artifact, all three forgery defences tested independently,
measured revocation-to-session-destruction inside the class `L0` bound, WCAG 2.2 AA
conformance evidence, and runbooks written for session-store outage, back-channel
logout failure, client key rotation, and suspected session fixation.
