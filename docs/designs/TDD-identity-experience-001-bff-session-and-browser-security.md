---
doc_meta:
  id: TDD-identity-experience-001
  title: Backend-for-Frontend Session and Browser Security
  owner: Identity Experience Team
  version: 1.1.0
  status: approved
  classification: restricted
  review_cycle_days: 90
  created_date: 2026-08-11
  last_reviewed: 2026-09-28
  parent_sad: SAD-002
---

# Backend-for-Frontend Session and Browser Security

## Purpose

Specify how a browser obtains and holds an authenticated session for the Identity
administrative experiences, where tokens live, how a revocation reaches an open
browser session, and which risks the chosen pattern trades away.

STD-IAM-001 §3.9 fixes the shape:

> Browser applications MUST NOT persist refresh tokens or equivalent long-lived
> bearer secrets in `localStorage`.
>
> Privileged/admin experiences SHOULD prefer secure `HttpOnly`, `Secure`,
> appropriately scoped cookies backed by server-side/BFF session control.

This design is the realization of that rule. The browser holds an opaque session
cookie and never holds a token. Every token lives server-side in the BFF, which is a
confidential OAuth client.

## Scope

**In scope**

- The authorization code exchange, PKCE, and where the resulting tokens are held.
- Session cookie properties, the server-side session store, and its lifetime.
- Cross-site request forgery defence, which becomes the primary risk once cookies
  carry authority.
- Server-side refresh, and what a failed refresh means.
- How Membership revocation and Keycloak session removal reach an open browser tab.
- Step-up authentication for privileged operations.
- Back-channel logout and global sign-out.

**Out of scope**

- Hosted login, MFA enrollment, and recovery pages, which are Keycloak-rendered
  through the theme in `identity-kernel`.
- The Identity Control API contract, owned by the `identity-control` designs.
- Token claim set and lifetime classes, owned by STD-IAM-002.
- Visual design, component composition, and accessibility conformance.

## Technical Context

Three parties, and the token boundary sits between the first two:

```text
Browser  ──opaque session cookie──►  BFF  ──access token──►  Identity Control API
                                      │
                                      └──authorization code + PKCE──►  Keycloak
```

The browser is treated as an untrusted execution environment. A cross-site scripting
defect in a single-page application that holds tokens yields those tokens; the same
defect against this design yields the ability to make requests while the tab is open,
which is bounded by the session and revocable server-side. The difference is
exfiltration versus use.

The BFF is a confidential client. It holds a client secret sourced from the approved
secret manager, which STD-IAM-001 §3.2 prohibits any public browser application from
holding.

This experience is `privileged` in the audience taxonomy of STD-IAM-002 §3.1, so its
access tokens take lifetime class `L0`: a four-minute lifetime derived from a
five-minute revocation target. That figure is what bounds how long an open browser
tab survives a revocation, and it is the reason the class is not a tuning parameter.

## Component Design

| Component | Responsibility |
| :-- | :-- |
| `AuthController` | Initiates the authorization request, handles the callback, exchanges the code |
| `SessionStore` | Server-side session records keyed by an opaque identifier |
| `TokenHolder` | Holds access and refresh tokens per session; never serialized to the browser |
| `ApiProxy` | Forwards browser requests to the Identity Control API, attaching the access token |
| `CsrfGuard` | Origin and token checks on every state-changing request |
| `LogoutController` | Front-channel logout, back-channel logout receiver, global sign-out |
| `StepUpController` | Re-authentication for operations requiring elevated assurance |

### Sign-in

```mermaid
sequenceDiagram
    participant B as Browser
    participant F as BFF
    participant K as Keycloak
    participant S as Session store

    B->>F: GET /auth/login
    F->>F: Generate PKCE verifier, state, nonce
    F->>S: Stash verifier, state, nonce against a pre-session
    F-->>B: 302 to Keycloak authorization endpoint
    B->>K: Authenticate on the hosted login page
    K-->>B: 302 back with code and state
    B->>F: GET /auth/callback?code&state
    F->>S: Validate state, load verifier
    F->>K: Exchange code with verifier and client secret
    K-->>F: Access token, refresh token, ID token
    F->>F: Validate ID token: iss, aud, nonce, signature, exp
    F->>S: Create session, store tokens server-side
    F-->>B: Set-Cookie session; 302 to the application
```

The code never reaches application JavaScript, the tokens never reach the browser,
and `state` and `nonce` are validated rather than merely sent.

## Data Model

### Session Cookie

```text
Name       __Host-ident_session
Value      opaque, 256 bits from a cryptographic random source
HttpOnly   yes
Secure     yes
SameSite   Lax
Path       /
Domain     omitted, which the __Host- prefix requires
Max-Age    omitted, so the cookie is a session cookie
```

The `__Host-` prefix is not cosmetic. It makes the cookie rejectable by the browser
unless it is `Secure`, has no `Domain`, and has `Path=/`, which prevents a subdomain
from setting or overwriting it. On a platform where several applications share a
parent domain, that closes cookie fixation from a neighbouring host.

`SameSite=Lax` rather than `Strict` because the OIDC callback is a cross-site
top-level navigation and `Strict` would drop the cookie on return from Keycloak.
`Lax` still blocks cross-site sub-requests and form posts, which is the CSRF surface
that matters here.

The value is opaque and carries no encoded state. A signed cookie carrying claims
would reintroduce the problem this design exists to remove: authority material held
in the browser.

### Server-Side Session

```text
session_id          opaque identifier, the cookie value
principal_id        enterprise reference from the access token
tenant_id           active operating context
kc_session_state    Keycloak session identifier, for back-channel logout correlation
access_token        held server-side, never serialized to the browser
refresh_token       held server-side, never serialized to the browser
acr                 authentication context reached
auth_time           when authentication occurred
csrf_token          per-session value, delivered to the browser and echoed in a header
created_at
last_seen_at
absolute_expiry     created_at + 8 hours
idle_expiry         last_seen_at + 30 minutes
```

Two expiries, because they bound different risks. Idle expiry limits an unattended
workstation; absolute expiry limits a stolen session identifier regardless of
activity.

The store is server-side and shared across BFF replicas so a session survives a
replica restart and a load-balancer decision. It is PostgreSQL: a database of the BFF's own,
reached by a role that holds DML on the session table and nothing else. The administrator
population is small, so one indexed lookup per request fits the proxy budget, and a
store that survives restarts needs no second persistence technology beside the ones the
estate already operates.

## Runtime

The BFF is TypeScript on Node.js, as SAD-002 §3 fixes for every container in this
repository, on Fastify. It also serves the built browser application, so the browser
reaches one origin: the session cookie, the content security policy and the API proxy
all apply to it. The browser application is rendered client-side, per STD-GLB-FE-001 §3
for authenticated administrative portals, and is built with Vite.

## API / Interface

### BFF Endpoints

```text
GET   /auth/login
GET   /auth/callback
POST  /auth/logout
POST  /auth/step-up
POST  /auth/back-channel-logout
GET   /auth/session
POST  /auth/context
ALL   /api/*
```

`GET /auth/session` returns the current display context: principal identifier, active
tenant, assurance level, and expiry hints. It returns no token and no credential.

`ALL /api/*` proxies to the Identity Control API. The proxy attaches the access token
from the session and forwards nothing the browser supplied as authority.

Errors are RFC 7807 problem documents per STD-GLB-001, with the problem types of
`foundation-platform`'s registry. `foundation-platform` is a Go module, so the BFF writes
the same types and fields rather than importing its serializer.

### Cross-Site Request Forgery Defence

Cookie-borne authority means a cross-site request carries credentials automatically.
Three independent checks apply to every state-changing request, and all three must
pass:

1. `SameSite=Lax` on the session cookie.
2. `Origin` header equal to the expected origin. A request with no `Origin` on a
   state-changing method is rejected rather than allowed.
3. A per-session CSRF token delivered to the browser and echoed in a request header,
   compared in constant time.

The layers are independent by design. `SameSite` depends on browser behavior, the
origin check depends on a header an attacker cannot set cross-origin, and the token
check depends on same-origin read access. A defect in any one leaves the other two.

This is the honest cost of the pattern. Holding tokens in JavaScript removes CSRF and
adds token exfiltration through XSS. This design removes exfiltration and adds CSRF,
which is defensible because CSRF has three deterministic defences and token
exfiltration has none once it has happened.

## Algorithms / Logic

### Refresh

```text
before proxying a request:
    if access token expires within the skew window:
        refresh server-side using the stored refresh token
        on success: replace both tokens in the session
        on failure: destroy the session, clear the cookie, respond 401
```

Refresh is invisible to the browser and never triggers a redirect for an active user.

The failure branch is an enforcement mechanism, not an error path. When a Membership
is revoked, `identity-control` removes the Keycloak session; the next refresh from
this BFF fails, and the session is destroyed. That is the second of the four
revocation mechanisms reaching a browser tab.

### How a Revocation Reaches an Open Tab

The BFF is affected by three of the four mechanisms, at three different latencies:

| Mechanism | Effect here | Latency |
| :-- | :-- | :-- |
| Keycloak session removed | The next server-side refresh fails and the session is destroyed | Up to the remaining access token lifetime, four minutes at class `L0` |
| Back-channel logout | Keycloak notifies the BFF directly; the session is destroyed immediately | Propagation time |
| Control API rejects the token | The proxied request returns 401 and the session is destroyed | Next request |

Back-channel logout is the fast path and is registered for exactly that reason. The
refresh path is the guaranteed one: it requires no callback to arrive and no request
to be made, so it bounds the interval even when the browser is idle and the
notification is lost.

A tab whose session is destroyed receives 401 on its next call and redirects to
sign-in. The design does not attempt to push a notification into an idle tab, because
an idle tab makes no request and therefore exercises no authority.

### Step-Up

```text
on an operation requiring elevated assurance:
    if session.acr satisfies the requirement and auth_time is recent enough:
        proceed
    else:
        redirect to Keycloak with the required acr_values and max_age
        on return, update session.acr and auth_time
        proceed once
```

The requirement is declared by the Identity Control API, not decided by the browser.
The BFF reads the requirement from the API's response and drives the ceremony; it
never grants elevated assurance on its own.

### Context Switch

Switching the active Tenant issues a new token carrying exactly one context, per
STD-IAM-002 §3.2. The BFF performs a fresh authorization request on the existing
Keycloak SSO session — a redirect round trip, not a credential prompt — and replaces
the tokens in the server-side session. The previously issued token is left unchanged
and expires on its own schedule.

A switch to a Tenant for which no active Membership exists is refused by the Control
API, and the BFF surfaces the refusal rather than retrying.

### What the BFF Must Not Do

- It makes no authorization decision. Every command is reauthorized by the Identity
  Control API, per SAD-002 §8.
- It holds no business state and no domain logic.
- It never returns an access token, refresh token, ID token, or client secret to the
  browser, on any endpoint, including diagnostics.
- It never accepts a Tenant identifier from the browser as authority; a requested
  context is validated against the session and the API.

STD-IAM-001 §3.9 states the reason directly: UI authorization is defence in depth and
user-experience control only.

## Configuration

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `IDENTITY_EXPERIENCE_ISSUER` | none, required | Expected `iss`, validated on every ID token |
| `IDENTITY_EXPERIENCE_CLIENT_ID` | none, required | Confidential client identifier |
| `IDENTITY_EXPERIENCE_CLIENT_SECRET` | none, required | Sourced from the approved secret manager |
| `IDENTITY_EXPERIENCE_REDIRECT_URI` | none, required | Exactly registered, no wildcard |
| `IDENTITY_EXPERIENCE_SESSION_IDLE` | `30m` | Idle expiry |
| `IDENTITY_EXPERIENCE_SESSION_ABSOLUTE` | `8h` | Absolute expiry |
| `IDENTITY_EXPERIENCE_REFRESH_SKEW` | `30s` | Refresh ahead of expiry |
| `IDENTITY_CONTROL_BASE_URL` | none, required | Identity Control API |

No secret appears in a built artifact, in client-side configuration, or in any
response body.

### Security Headers

Every response carries, per STD-GLB-FE-003 and the browser rules in STD-IAM-001 §3.9:

```text
Content-Security-Policy      default-src 'none'; script-src 'self'; style-src 'self';
                             img-src 'self' data:; font-src 'self'; connect-src 'self';
                             manifest-src 'self'; base-uri 'none'; form-action 'self';
                             frame-ancestors 'none'
Strict-Transport-Security    max-age=31536000; includeSubDomains
X-Frame-Options              DENY
X-Content-Type-Options       nosniff
Referrer-Policy              no-referrer
Cross-Origin-Opener-Policy   same-origin
Cross-Origin-Resource-Policy same-origin
Permissions-Policy           camera=(), microphone=(), geolocation=(), payment=()
```

The content security policy carries no `unsafe-inline` and no `unsafe-eval`. A policy
that permits either removes most of the protection that makes cookie-held authority
acceptable in the first place.

`default-src 'none'` falls back for every directive not named. An earlier revision of
this table named only `script-src` and `connect-src`, which would have refused the
application's own stylesheets, fonts and images. Each is named here, and each is `'self'`:
the build emits styles and fonts as files served from this origin, never inline.
`data:` images are allowed for inline icons only. `form-action 'self'` and
`base-uri 'none'` close the two injection paths that `script-src` does not cover.

## Testing Strategy

### Token Containment

- No response body, header, or client-side bundle contains an access token, refresh
  token, ID token, or client secret, asserted by scanning every endpoint response and
  the built artifact.
- `localStorage` and `sessionStorage` hold no credential after a full sign-in flow.
- A session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefixed, and
  carries no encoded state.

### Sign-in Correctness

- A callback with a mismatched `state` is rejected.
- An ID token with a mismatched `nonce`, wrong `iss`, wrong `aud`, or invalid
  signature is rejected.
- The authorization request uses PKCE with `S256`.
- A redirect URI not exactly registered is refused by Keycloak.

### Cross-Site Request Forgery

- A state-changing request with a foreign `Origin` is rejected.
- A state-changing request with no `Origin` is rejected.
- A state-changing request with a missing or wrong CSRF token is rejected.
- A cross-site form post carrying the session cookie is rejected.

### Revocation

- After Keycloak session removal, the next server-side refresh fails and the session
  is destroyed.
- Back-channel logout destroys the matching session and no other.
- A 401 from the Identity Control API destroys the session.
- Measured time from Membership revocation to session destruction stays within the
  remaining access token lifetime of class `L0`.

### Session Lifetime

- Idle beyond `SESSION_IDLE` invalidates the session.
- A continuously active session ends at `SESSION_ABSOLUTE` regardless of activity.
- A session survives a BFF replica restart and a load-balancer change.

### Negative

- The browser cannot set the active Tenant by supplying an identifier.
- A step-up requirement cannot be satisfied by a client-supplied claim.
- A privileged command rejected by the Control API is not retried with different
  parameters by the BFF.

## Security Notes

The pattern trades token exfiltration for cross-site request forgery, and that trade
is stated here rather than left implicit. Exfiltration is unbounded once it happens:
a stolen refresh token is usable from anywhere, for as long as it lives, with no
signal. Cross-site request forgery is bounded to what an open session can do, is
detectable at the server, and has three independent deterministic defences.

The client secret makes this a confidential client, which is what permits refresh
tokens to exist at all for a browser-facing experience. A public client holding a
refresh token in the browser is prohibited by STD-IAM-001 §3.2 and is the pattern
this design replaces.

Session identifiers are opaque and randomly generated, so possession of one confers
no information and it cannot be forged from knowledge of a principal.

The absolute expiry is the control that survives every other failure. If back-channel
logout is lost, if revocation propagation stalls, and if the user never becomes idle,
the session still ends within eight hours.

## Performance Notes

Every proxied request performs one session-store lookup and one token attachment.
Refresh occurs at most once per access token lifetime per session, and at class `L0`
that is once every four minutes for an active session, which is a server-side call
invisible to the user.

The session store is read on every request, so it is sized for the concurrent
administrator population rather than for total sessions, and its latency budget is
part of the proxy request budget rather than additional to it.

## Operational Notes

| Signal | Warning | Critical |
| :-- | :-- | :-- |
| Refresh failure rate | above baseline | ten times baseline |
| CSRF rejection | any occurrence | sustained from one origin |
| Back-channel logout not received for a removed Keycloak session | any occurrence | — |
| Session-store latency | above the proxy budget | twice the budget |
| Token or secret detected in a response body | — | any occurrence |

A rise in refresh failures is the expected signature of a mass revocation and is not
by itself a defect. It is correlated against revocation events before being treated
as an incident.

Runbooks required before production: session-store outage, back-channel logout
failure, client secret rotation, and suspected session fixation.

## Traceability

| Relationship | Target |
| :-- | :-- |
| Parent system | SAD-002 — Scnehaux Identity Experience |
| Realizes capability | PAD-PLT-001 — Identity & Access Platform |
| Governed by | ADR-IAM-001 — Adopt Keycloak Identity Kernel |
| Conforms to | STD-IAM-001 §3.9 — no browser-held refresh tokens; BFF session control for privileged experiences |
| Conforms to | STD-IAM-001 §3.2 — Authorization Code with PKCE `S256`; confidential client authentication |
| Conforms to | STD-IAM-002 §3.1, §3.3 — `privileged` audience class and lifetime class `L0` |
| Conforms to | STD-GLB-001 — RFC 7807 problem details |
| Enterprise constraint | EAD-006 — default deny; a valid artifact is not an authorization decision |
| Depends on | `identity-kernel` — hosted login, realm configuration, back-channel logout registration |
| Depends on | `identity-control` — the Identity Control API, which reauthorizes every command |
| Conforms to | `foundation-platform` problem registry — the same problem types, written in TypeScript |
| Build-time dependency | `scnehaux-ui-platform` — design system packages, per SAD-002 §1 |

### Standalone Operation

This repository requires no Scnehaux platform other than the five it shares this
foundation with. It has one build-time dependency on `scnehaux-ui-platform`, which
produces no runtime edge, and no dependency on Notification, Audit, Software Catalog,
or Subscription & Entitlement. Verification and recovery messages are delivered by the
identity kernel's own mail path, and evidence facts leave through the Identity Control
outbox.
