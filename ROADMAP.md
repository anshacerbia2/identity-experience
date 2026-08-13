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

| TDD | Subject | Status |
| :-- | :-- | :-- |
| `TDD-identity-experience-001` | Backend-for-frontend session and browser security | approved |
| `TDD-identity-experience-002` | Account security: sessions, devices, authenticators, consent | approved |
| `TDD-identity-experience-003` | Identity administration and investigation | approved |
| `TDD-identity-experience-004` | Developer console: application onboarding and credential lifecycle | approved |

## Week 1 · The BFF

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

| Repository | What this needs from it |
| :-- | :-- |
| `identity-kernel` | Hosted login, realm configuration, back-channel logout registration, step-up `acr` values |
| `identity-control` | The Identity Control API, which reauthorizes every command |
| `scnehaux-ui-platform` | Design system packages, build-time only |

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
