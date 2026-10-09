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

All four items are built, and the exit below is met.

- ✅ Back-channel logout receiver, destroying the matching session and no other
- ✅ 401 from the Identity Control API destroying the session
- ✅ Front-channel logout and global sign-out. Global sign-out is built: sign-out ends the Keycloak
  session server-side, and the account application's "Sign out everywhere" ends every one.
  ✅ **Front-channel logout is decided against** (ADR-IAM-009, TDD-001 1.18.0 §No Front-Channel
  Logout). The kernel removes sessions through the Admin API, which reaches a client only by the back
  channel, and Keycloak 26.7.5 skips the back channel for a client with front-channel logout on; the
  frame would be refused by `frame-ancestors 'none'` and denied its cookie by `SameSite=Lax` and
  browser partitioning. identity-control writes front-channel logout off on every client.
- ✅ Step-up: reading the requirement from the API, driving the ceremony, never granting
  assurance locally

**Exit:** measured time from Membership revocation to session destruction stays within
the remaining access token lifetime of class `L0`; a lost back-channel notification does
not extend it, because the refresh path bounds it independently.

✅ **Met, measured against the stack** (TDD-001 1.19.0 §Revocation). The bound was asserted first
(1.16.0): `bff/test/containment.test.ts` removes the kernel session at five points in a token's life,
delivers no back-channel logout, and the session ends no later than the expiry of the token it held.
The measurement is organization-experience's `stack-proof` workflow (STD-GLB-009 §Stack-Level Proofs),
which brings up the kernel, identity-control, organization-control, this BFF and its applications at
`identity_experience_ref`, and organization-experience's BFF, and drives them in Chromium. Its
`stack-evidence` artifact holds each figure with its bound. In run
[37853070937](https://github.com/anshacerbia2/organization-experience/actions/runs/37853070937), every
repository at `main`:

| Revoked                                                          | Session                                                             | Accepted to kernel applied | Accepted to session ended |   Bound | Ended by        |
| :--------------------------------------------------------------- | :------------------------------------------------------------------ | -------------------------: | ------------------------: | ------: | :-------------- |
| a Membership, at Organization Control                            | a Tenant session of this pattern, served by organization-experience |                      2.7 s |                   162.9 s | 192.6 s | refresh refused |
| a kernel session, from another device in the account application | this BFF's                                                          |                      0.2 s |                   209.2 s | 238.9 s | refresh refused |

- **A Membership revocation sends no back-channel logout.** It removes no kernel session
  (`ADR-IAM-006 §5.5`), so the refresh path alone bounds it, and a lost notification cannot extend it.
  No request was served after acceptance: Organization Control refused the token at once with `403`.
  An idle tab's first request was refused, and one after its token expired found the session gone.
  This BFF holds no Tenant session, so the session measured is the pattern's as organization-experience
  serves it; its pattern files were this repository's byte for byte at the ref checked out.
- **A removed kernel session, with and without the back channel.** Without a registered back-channel
  logout URL, the refresh path ended the session, with no refresh succeeding after the removal. The URL
  is registered through identity-control's `backchannel_logout_uri` (TDD-identity-control-003 1.37.0),
  and identity-control's `deploy-dev` proves a client registered that way from zero receives the logout
  token for the session the API ends. With it registered (the `logout-and-self-commands` branches of
  identity-kernel, identity-control and this repository), run
  [37853072129](https://github.com/anshacerbia2/organization-experience/actions/runs/37853072129) saw the
  back channel end the session 0.9 s after acceptance, before identity-control's answer reached the other
  device; the Membership revocation there took 167.7 s against 197.3 s.
- **Two early runs did not end: the kernel accepted a refresh of a session it had removed.** In runs
  [37843816015](https://github.com/anshacerbia2/organization-experience/actions/runs/37843816015) and
  [37846007225](https://github.com/anshacerbia2/organization-experience/actions/runs/37846007225) the
  removed session's tab kept being answered `200` for five to six minutes after the kernel stopped
  listing the session. Read again on 2026-10-09, their logs and artifacts place the cause in the kernel,
  not in this BFF:
  - **A refresh succeeded after the removal.** Run 37846007225's evidence counts one refresh after the
    kernel applied the removal (the session's token expiry moved from 21:30:42), and every answer after
    acceptance was `200`. In run 37843816015 the tab was answered `200` until 21:13:43, 91 s past the
    expiry of the token held at the removal (about 21:12:12, 240 s after the sign-in); the API refuses an expired token, so the
    session held a refreshed one.
  - **The kernel refused nothing.** Keycloak logs a refused refresh at `WARN` as `REFRESH_TOKEN_ERROR`
    ("Session not active", run 37847908410 at 21:46:12). Both runs kept the kernel's whole log, 44 lines
    each from start-up to the failure, below the 200 the job prints, and neither holds a
    `REFRESH_TOKEN_ERROR`, or any line at all, between the removal and the end of the wait.
  - **The BFF extends a session only on the kernel's grant.** `Sessions.fresh` keeps the session only
    when the token endpoint answers the refresh with tokens; any refusal destroys it, and an outage
    answers `503`, never `200` (`bff/src/session/sessions.ts`, `bff/src/auth/oidc.ts`).
  - **The removal was the kernel's.** identity-control removed the session with `DELETE
/admin/realms/scnehaux/sessions/{id}` (`internal/keycloak/containment.go`), and the kernel stopped
    listing it 0.2 s after acceptance (run 37846007225's evidence).

  The same code at every repository (kernel `126d684`, identity-control `4d6da9d`, this repository
  `f7233ae`) then passed eight times, so the kernel's behaviour is intermittent. The removal came 1.3 to
  1.5 s after the session's sign-in in both failures, and about 1.1 s after it in the passing runs, so
  timing alone does not separate them. Why Keycloak 26.7.5 granted the refresh is identity-kernel's to
  establish, with a compatibility test that removes a session through the Admin API shortly after
  sign-in and then refreshes it, many times. Since run 37847908410 a recurrence fails the proof and
  keeps the kernel's own `REFRESH_TOKEN` and `REFRESH_TOKEN_ERROR` events. Until the kernel's cause is
  found, the refresh path's bound for a removed kernel session is measured, not guaranteed, where no
  back-channel logout URL is registered.

- **The development server.** A BFF on a developer's machine registers no back-channel logout URL,
  because the kernel cannot reach it (ADR-IAM-009 §5.3), so there the refresh path is the bound
  (`docs/runbooks/back-channel-logout-failure.md`).

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

- ✅ Session and device inventory with termination
- ✅ Authenticator enrollment, replacement, and removal
- Consent inventory and withdrawal: waits for identity-control's slice 3b, which serves no consent
  route yet
- ✅ Recovery entry points, handing off to the kernel-rendered pages: recovery codes are issued and
  replaced on the kernel's page (`kc_action=CONFIGURE_RECOVERY_AUTHN_CODES`), and a code is used at the
  kernel's sign-in

✅ **Authenticator replacement** is enrollment, then removal (TDD-002 1.7.0). The last-authenticator
refusal says so, and the ways to add one are beside it (`SecurityPage.test.tsx`).

**Exit:** every destructive action is reauthorized by the Identity Control API and
carries an idempotency key, an optimistic version, and a reason.

**Met, with the exit restated for a person's own commands** (STD-GLB-001 1.5.0, TDD-002 1.9.0
§Commands). Every action is reauthorized by the Identity Control API, and the BFF decides nothing.
Every command carries an Idempotency-Key, asserted in `SecurityPage.test.tsx`. A person's own command
carries no version and no reason, by decision: it ends or adds one object named by a fresh handle, so
there is no lost update for a version to guard (RFC 9110 §13.1.1, RFC 6585 §3), and the actor is the
subject, so the audit record already says who and what (NIST SP 800-53 AU-3); Microsoft Graph's and
Okta's self-service APIs take neither. The version and the reason stay required on an administrator's
commands, which act on someone else's record.

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
kind. ✅ Lifetime-class changes followed identity-control's `lifetime_class` kind (ADR-IAM-003 §5.9,
TDD-004 1.11.0 §Lifetime-Class Changes, TDD-003 1.23.0): a resource's page proposes the next class,
each of the four shown as its token lifetime and revocation target, and the approval queue shows the
class a change moves from and to. A confidential registration shows its back-channel logout URI, or
that it has none.

- ✅ Identity administration and investigation surfaces
- ✅ Application and client onboarding, redirect and audience configuration
- ✅ Client public-key registration and rotation flow (TDD-004 1.2.0)
- Privileged action reason and evidence capture: ✅ every command sends its reason; the evidence panel
  waits for the Audit API (TDD-003 §Evidence)

**Exit:** no administrative control is available in the interface that the Control API
would refuse, and no control the API permits is hidden without a stated reason.

✅ **Met** (TDD-003 1.24.0). The first half holds where tested: each control is offered from the state
the API accepts it in (lifecycle, keys, changes, findings, workloads, owners, a Principal's
containment). For the second, every route identity-control serves at `main` `f2e140d`, 70 of them,
was checked on 2026-10-09 against the applications: each has a screen, or a stated reason for none
(adoption, TDD-003 §Registration Drift Oversight; a post to Organization Control, §Tenant Context
Report). Every control found on 2026-10-07 has a screen (TDD-003 1.21.0, TDD-004 1.9.0), each sending
its reason and an Idempotency-Key (STD-GLB-001 1.4.0), with no version where the API takes none:

- ✅ Granting and revoking a registration's owners: the Admin Portal's registration page
  (§Registration Ownership). Grant is not offered on a retired registration, and revoke not where
  production would keep fewer than two owners. The Developer Console offers neither: both are a
  provider's.
- ✅ The parked security operations and their re-drive: the Principals page.
- ✅ The workload sweep, and the orphaned, unused and review-overdue lists, each read when opened: the
  Workloads page. A workload offers a rebuild when active or orphaned, and a review to its owner.
  ✅ The Developer Console's "My workloads" lists what a person owns with each workload's last review
  and next review due, an overdue one marked, and offers the owner's review on the workload's page
  (ADR-IAM-003 §5.8; TDD-004 1.10.0, TDD-003 1.22.0), on identity-control's owner read
  (`GET /v1/workloads:mine` and the owner's `GET /v1/workloads/{principal_id}`, TDD-identity-control-004
  1.7.0). The record and who may review it are shared in `packages/app-core/src/domain/workload.ts`.
- ✅ The unmapped, orphan and duplicate kernel users: the Principals page, with no action, because the
  API has none. The kernel event sweep: a Principal's Events section.

- ✅ The four provider reads found on 2026-10-08 (TDD-003 1.24.0):
  - `GET /v1/principals/{principal_id}/notification-addresses` and `…/security-notifications`: two
    sections of a Principal's page, read only when opened. A failed or addressless notification says
    what it means; nothing is offered, because the addresses are the person's own and the record is
    evidence.
  - `GET /v1/provider-grants:emergency-validation`: Governance, **Emergency access**. Each grant with
    its last use, an overdue one marked. No command, because the grants are Organization Control's; a
    drill validates one.
  - `GET /v1/projections/tenant-context/report`: Monitoring, **Tenant context**. The report, read when
    asked, shown and copied unchanged. Posting it to Organization Control's reconcile route has no
    screen here: that route is Organization Control's, behind its own sign-in.

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

✅ **Met.** All four are approved, now at 1.20.0, 1.9.0, 1.24.0 and 1.11.0.

**Production gate.** The design gate, plus: token containment proven by scanning every
response and the built artifact, all three forgery defences tested independently,
measured revocation-to-session-destruction inside the class `L0` bound, WCAG 2.2 AA
conformance evidence, and runbooks written for session-store outage, back-channel
logout failure, client key rotation, and suspected session fixation.

Where the production gate stands:

- ✅ Token containment: `bff/test/containment.test.ts` and `scripts/check-dist.mjs` (Week 1 exit).
- ✅ The three forgery defences, each refusing on its own with the other two right
  (`bff/test/containment.test.ts`). ✅ `SameSite=Lax` is enforced by the browser, in Chromium in CI
  (`e2e/tests/same-site.spec.ts`, TDD-001 1.20.0): a cross-site form post, `fetch()` post and iframe
  carry no session cookie, and a same-site post and a cross-site top-level link do.
- ✅ Measured revocation (Week 2 exit), with one open question for identity-kernel: the two early runs
  in which the kernel granted a refresh of a session it had removed.
- WCAG 2.2 AA: automated evidence only. axe runs on every page's rendered DOM in the component tests
  (jsdom), and in Chromium in CI on each main page of the three applications, signed in with data
  (`e2e/tests/accessibility.spec.ts`, TDD-003 §Accessibility in a Browser), with no violation. axe
  marks colour contrast "needs review" on every page, because the canvas is a gradient and the panels
  are translucent over it. Keyboard order, focus, zoom, colour contrast and a screen reader need the
  manual audit against WCAG 2.2 AA, which remains.
- ✅ Runbooks: `docs/runbooks/`.
