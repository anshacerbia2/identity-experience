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
| `TDD-identity-experience-004` | Developer console: application onboarding and credential lifecycle | approved |

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

**Owed to identity-control.** `identity-experience-bff` is created by a script, not registered:
identity-control's registration API builds public and resource clients only, and a confidential one
needs credential issuance. Before identity-control starts disabling unmanaged clients, this client
must be registered, or it is disabled with every session it holds.

- Authorization code exchange with PKCE `S256`, confidential client authentication
- `state` and `nonce` generated, stashed, and validated on return
- ID token validation: issuer, audience, nonce, signature, expiry
- Server-side session store, shared across replicas
- `__Host-` session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, opaque value
- Three independent cross-site request forgery defences
- Server-side refresh, with failure destroying the session
- Idle and absolute expiry

**Exit:** no response body, header, or built artifact contains a token or client secret,
asserted by scanning every endpoint; a cross-site form post carrying the session cookie
is rejected.

## Week 2 · Revocation reaching the browser

**Done early, with sign-in:** the back-channel logout receiver, a 401 from the Identity Control
API destroying the session, and sign-out ending the Keycloak session. **Next:** step-up, and the
measured exit below.

- Back-channel logout receiver, destroying the matching session and no other
- 401 from the Identity Control API destroying the session
- Front-channel logout and global sign-out
- Step-up: reading the requirement from the API, driving the ceremony, never granting
  assurance locally

**Exit:** measured time from Membership revocation to session destruction stays within
the remaining access token lifetime of class `L0`; a lost back-channel notification does
not extend it, because the refresh path bounds it independently.

## Week 3 · Account security

- Session and device inventory with termination
- Authenticator enrollment, replacement, and removal
- Consent inventory and withdrawal
- Recovery entry points, handing off to the kernel-rendered pages

**Exit:** every destructive action is reauthorized by the Identity Control API and
carries an idempotency key, an optimistic version, and a reason.

## Week 4 · Administration and developer console

- Identity administration and investigation surfaces
- Application and client onboarding, redirect and audience configuration
- Credential rotation request flow
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
logout failure, client secret rotation, and suspected session fixation.
