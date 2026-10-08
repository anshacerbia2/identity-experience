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

**Changed in TDD-001 1.17.0.** A session store that does not answer answers `503
dependency-unavailable`, not `500`: API calls, the session read and sign-out keep the cookie, and a
sign-in lands on `?sign-in=unavailable`. A back-channel logout it could not record answers `400`, as the
specification requires. A session that no longer opens under `IDENTITY_EXPERIENCE_SESSION_KEY` is a
signed-out one, `401`, instead of a `500` for every open session after the key changes
(`bff/test/store-outage.test.ts`, `docs/runbooks/session-store-outage.md`). organization-experience
takes the change through `bff/conformance.json`.

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
✅ **Done, the real realm:** `scripts/dev-local.ps1` runs the BFF on a developer's machine, with no
Docker, against the development kernel's realm, as the registered client `identity-experience-bff`
(below, "The BFF's client is a registration"). Week 4 started with that first real sign-in.

✅ **The BFF authenticates with its own key** (TDD-001 1.4.0, `ADR-IAM-001 §5.12`). It signs a
PS256 client assertion with its private key, through `openid-client`'s `PrivateKeyJwt` for the token
endpoint and `jose` for the logout endpoint. The key is made on the developer's machine by
`scripts/new-client-key.mjs`, and only its public half goes to the server. The client has no secret.
The stand-in kernel in the tests refuses a secret, a replayed assertion, and a key other than the
registered one.

~~**Owed to identity-control.**~~ ✅ Paid. When this was written, `identity-experience-bff` was
created by a script and identity-control could not register a confidential client. identity-control
now registers confidential clients by public key (its ROADMAP: "Client key registration",
TDD-identity-control-003 §Client Key Records), and this BFF's client is a registration, adopted on
the development server (below, "The BFF's client is a registration").

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

✅ **Met** (TDD-001 1.16.0). `bff/test/containment.test.ts` scans every route on its success and
refusal paths, more than thirty responses, for every token the stand-in kernel issued, any JSON Web
Token, the client private key, the session key and the authorization code. `scripts/check-dist.mjs`
fails the build on a JSON Web Token, private key or client secret in any application's bundle.
`bff/test/auth.test.ts` "refuses a cross-site form post carrying the session cookie" sends one with a
foreign `Origin`, and nothing reaches the API.

✅ **The BFF's client is a registration** (TDD-001 1.14.0). It is confidential and `privileged` in the
`provider-scope` form (TDD-identity-control-003 1.29.0), never `internal`, because the Admin Portal's
calls need `acr` and `auth_time`. A new server registers it through identity-control. The client
`deploy/dev/create-bff-client.sh` made on the development server is adopted by identity-control's
`scripts/dev-adopt-bff.ps1`, a plan first and the adoption with `-Apply`, which converges its token
format and scopes. Until then the sweep reports it `unmanaged`. The script's header now says it is
superseded.

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
- Front-channel logout and global sign-out. Global sign-out is built: sign-out ends the Keycloak
  session server-side, and the account application's "Sign out everywhere" ends every one.
  **Front-channel logout is an open decision**, not built: TDD-001 names it in `LogoutController` and
  specifies no endpoint for it, and its own `frame-ancestors 'none'` refuses the frame OpenID Connect
  Front-Channel Logout 1.0 renders the logout URI in.
- Step-up: reading the requirement from the API, driving the ceremony, never granting
  assurance locally

**Exit:** measured time from Membership revocation to session destruction stays within
the remaining access token lifetime of class `L0`; a lost back-channel notification does
not extend it, because the refresh path bounds it independently.

**Half met** (TDD-001 1.16.0). The bound is asserted: `bff/test/containment.test.ts` removes the
kernel session at five points in a token's life, delivers no back-channel logout, and the session ends
no later than the expiry of the token it held. The measurement is not: timing a real Membership
revocation needs organization-control, identity-control and the kernel together with this BFF, which
no job of this repository runs. It belongs in a stack-level proof. Note also that no repository
registers the BFF's back-channel logout URL on a server yet, so today every server relies on the
refresh path (`docs/runbooks/back-channel-logout-failure.md`).

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

A provider's refused removal of their last second factor is shown with its sentence. Adding a security key followed identity-control's slice 4b (TDD-002 1.4.0, TDD-001 1.12.0): the API authorizes `{"type":"webauthn"}`, the BFF passes `kc_action=webauthn-register` from its allowlist, and the kernel's page registers the key. Recovery codes followed ADR-IAM-005 (TDD-002 1.5.0, TDD-001 1.13.0): each set is listed with how many codes remain, a used set is pointed out, and "Get new recovery codes" drives `kc_action=CONFIGURE_RECOVERY_AUTHN_CODES`. "Where you are told" followed ADR-IAM-007 and identity-control's TDD-008 1.2.0 (TDD-002 1.6.0): the person's notification addresses, a prompt for a second while there is one, adding and removing under step-up, and proving a pending address with the code sent to it, which this application never sees. **Next:** consents once the API's slice 3b exists.

- Session and device inventory with termination
- Authenticator enrollment, replacement, and removal
- Consent inventory and withdrawal
- Recovery entry points, handing off to the kernel-rendered pages

✅ **Authenticator replacement** is enrollment, then removal (TDD-002 1.7.0). The last-authenticator
refusal says so, and the ways to add one are beside it (`SecurityPage.test.tsx`).

**Exit:** every destructive action is reauthorized by the Identity Control API and
carries an idempotency key, an optimistic version, and a reason.

**Not met as written, by the API's design.** Every action is reauthorized by the Identity Control
API, and the BFF decides nothing. Ending a session, signing out everywhere and removing an
authenticator carry an Idempotency-Key, asserted in `SecurityPage.test.tsx`, and since TDD-002 1.8.0
so does every other command, notification addresses included. None carries a version or a reason:
identity-control's `/v1/me` commands take neither (TDD-002 §Commands, `TDD-identity-control-005`). Meeting it needs either
identity-control to accept them, or the owner to restate the exit for a person's own commands.

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
- Each command follows a `202` to its final state. The laptop BFF reaches identity-control at
  `IDENTITY_CONTROL_BASE_URL` (`scripts/dev-local.ps1`, `http://127.0.0.1:8097` by default), so these
  screens read real data wherever identity-control listens there.

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
(TDD-003 1.15.0). ✅ Audience changes followed identity-control's `audience` kind (TDD-004 1.8.0
§Audience Changes, TDD-003 1.20.0): an owner or a provider proposes the whole next audience with a
reason, a workload's page offers its audience alone, and the approval queue shows each change by its
kind. Lifetime-class changes are not offered: identity-control does not accept them, and they wait on
an owner decision there.

- Identity administration and investigation surfaces
- Application and client onboarding, redirect and audience configuration
- Client public-key registration and rotation flow (TDD-004 1.2.0)
- Privileged action reason and evidence capture

**Exit:** no administrative control is available in the interface that the Control API
would refuse, and no control the API permits is hidden without a stated reason.

**Not met yet; the 2026-10-07 list is closed.** The first half holds where tested: each control is
offered from the state the API accepts it in (lifecycle, keys, changes, findings, workloads, owners, a
Principal's containment). For the second, every control found on 2026-10-07 now has a screen
(TDD-003 1.21.0, TDD-004 1.9.0), each sending its reason and an Idempotency-Key (STD-GLB-001 1.4.0),
with no version where the API takes none:

- ✅ Granting and revoking a registration's owners: the Admin Portal's registration page
  (§Registration Ownership). Grant is not offered on a retired registration, and revoke not where
  production would keep fewer than two owners. The Developer Console offers neither: both are a
  provider's.
- ✅ The parked security operations and their re-drive: the Principals page.
- ✅ The workload sweep, and the orphaned, unused and review-overdue lists, each read when opened: the
  Workloads page. A workload offers a rebuild when active or orphaned, and a review to its owner.
  **Stated reason:** the Developer Console offers no review, because an owner who is not a provider
  cannot read the workload; it waits on identity-control serving the owner's read.
- ✅ The unmapped, orphan and duplicate kernel users: the Principals page, with no action, because the
  API has none. The kernel event sweep: a Principal's Events section.

Checked again on 2026-10-08, four provider reads have no screen and no stated reason yet:
`GET /v1/principals/{principal_id}/notification-addresses`, `…/security-notifications`,
`GET /v1/projections/tenant-context/report` and `GET /v1/provider-grants:emergency-validation`.

✅ **A Principal's events** (TDD-003 1.19.0, on identity-control's TDD-005 2.9.0). The Principal page
has an Events section, read only when opened: the hundred most recent sign-ins, failures and admin
changes from the kernel event record, each with its outcome and error code and the client or
resource type, and no address, session or kernel identifier. With it, seeing who signed in and who
failed no longer needs the kernel's Admin Console (ADR-IAM-001 §5.8).

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

✅ The BFF pattern can ask for one Tenant per sign-in (TDD-identity-experience-001 1.15.0,
ADR-IAM-008). `GET /auth/login?tenant=<tenant_id>` asks for
`scnehaux-privileged organization:<tenant_id>`. The callback refuses an ID token naming another
Tenant, or none, and refuses a provider sign-in that names one. The session holds the confirmed
Tenant, and a refresh returning another ends it. This application's clients are provider-scope, so
tenant sign-in stays off here. organization-experience, registered for the `per-sign-in` form,
turns it on through the same files (`bff/conformance.json`).

## Not this repository

Recorded so scope creep is visible rather than convenient:

- Hosted login, MFA enrollment, and recovery pages — `identity-kernel` theme.
- Any authorization decision — the Identity Control API.
- Organization, Tenant, Workspace, and Membership administration —
  `organization-experience`.
- Business state and domain logic of any kind.

## Gates

**Design gate.** All four designs at `1.0.0`.

✅ **Met.** All four are approved, at 1.17.0, 1.8.0, 1.21.0 and 1.9.0.

**Production gate.** The design gate, plus: token containment proven by scanning every
response and the built artifact, all three forgery defences tested independently,
measured revocation-to-session-destruction inside the class `L0` bound, WCAG 2.2 AA
conformance evidence, and runbooks written for session-store outage, back-channel
logout failure, client key rotation, and suspected session fixation.

Where the production gate stands:

- ✅ Token containment: `bff/test/containment.test.ts` and `scripts/check-dist.mjs` (Week 1 exit).
- ✅ The three forgery defences, each refusing on its own with the other two right
  (`bff/test/containment.test.ts`). `SameSite` is asserted as the attribute set; its enforcement is the
  browser's and is not exercised without a real browser.
- Measured revocation: the bound is asserted, the measurement is not (Week 2 exit).
- WCAG 2.2 AA: automated evidence only. axe runs against every page's rendered DOM in the component
  tests (jsdom). It cannot check colour contrast or layout in jsdom, and no automated check covers
  keyboard order, focus, zoom or a screen reader. A manual audit against WCAG 2.2 AA remains, and no
  browser test runs in CI (`@playwright/test` is a dependency of `apps/admin` and is not used).
- ✅ Runbooks: `docs/runbooks/`.
