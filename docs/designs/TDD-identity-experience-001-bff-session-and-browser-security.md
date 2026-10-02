---
doc_meta:
  id: TDD-identity-experience-001
  title: Backend-for-Frontend Session and Browser Security
  owner: Identity Experience Team
  version: 1.7.0
  status: approved
  classification: restricted
  review_cycle_days: 90
  created_date: 2026-08-11
  last_reviewed: 2026-10-01
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

The BFF is a confidential client. It authenticates to the token and logout endpoints with a
signed client assertion (`private_key_jwt`, PS256), as STD-IAM-001 §3.2 requires of a
registered confidential client (`ADR-IAM-001 §5.12`). Its private key is sourced from the
approved secret manager and never leaves this process. Identity Control registers only
the public key. STD-IAM-001 §3.2 prohibits any public browser application from holding such
a key.

The key's `kid` is its RFC 7638 thumbprint, which the BFF computes from the key itself, so the
key file is the only configuration it needs. On the development server,
`deploy/dev/create-bff-client.sh` creates `identity-experience-bff` directly, with the developer's
public key, because Identity Control cannot register a confidential client yet. The client has no
secret there either: STD-IAM-001 §3.2 allows none in any shared environment.

This experience is `privileged` in the audience taxonomy of STD-IAM-002 §3.1, so its
access tokens take lifetime class `L0`: a four-minute lifetime derived from a
five-minute revocation target. That figure is what bounds how long an open browser
tab survives a revocation, and it is the reason the class is not a tuning parameter.

Its access tokens name `identity-control-api` in `aud`: the Identity Control API's keyless
`resource` registration, never its Admin API client `identity-control`. STD-IAM-002 §3.1 forbids a
client that authenticates in `aud`, because Keycloak lets a client named there exchange the token.
A BFF registered before the resource existed moves by an audience change
(`TDD-identity-control-003` §Registration Changes).

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

    B->>F: GET /auth/login?return_to=/path
    F->>F: Generate PKCE verifier, state, nonce, login binding
    F->>S: Stash verifier, state, nonce against the binding's digest
    F-->>B: Set-Cookie login binding; 302 to Keycloak authorization endpoint
    B->>K: Authenticate on the hosted login page
    K-->>B: 302 back with code, state and iss
    B->>F: GET /auth/callback?code&state&iss, with the login binding
    F->>S: Consume the pre-session the binding names; validate state
    F->>K: Exchange code with verifier and a signed client assertion
    K-->>F: Access token, refresh token, ID token
    F->>F: Validate ID token: iss, aud, nonce, PS256 signature, exp
    F->>S: Create session, store tokens sealed server-side
    F-->>B: Set-Cookie session; 302 to return_to
```

The code never reaches application JavaScript, the tokens never reach the browser,
and `state` and `nonce` are validated rather than merely sent.

The login binding ties the callback to the browser that started the sign-in. Without
it, a code and state captured in one browser and delivered to another would sign the
second in as the first: login cross-site request forgery. The pre-session is consumed by
the callback, so a replayed callback finds nothing, and it lapses after ten minutes.
`return_to` is accepted only as a path on this origin, outside `/auth`, so the flow is
not an open redirect. A refused callback lands on `?sign-in=failed` at the root of the
application the sign-in started from: `/developer/` when its `return_to` is the Developer
Console's, `/` otherwise, so the notice is shown where the person was. Until the browser's own
pre-session is found, nothing says where the sign-in started, and it lands on `/`. The reason is
logged, not shown, because it may describe what an attacker presented.

A callback that could not reach Keycloak is not a refusal. That means no connection, a
timeout, or a 5xx from the token or key endpoint. It lands on `?sign-in=unavailable`, at the
same root,
is logged as an outage, and the application says Keycloak could not be reached and that
trying again may work. The first failed sign-in against the development kernel was
exactly this: the dev tunnel dropped the connection while the BFF fetched the realm's
keys, and the user was told it had been refused. Refresh classifies the same way (see
§Refresh). A token that fails validation is a refusal on either path, never an outage.

The ID token's signature is verified even though it arrives directly from the token
endpoint. The BFF may reach Keycloak on an internal address without TLS, and PS256 is
the only algorithm accepted, per STD-IAM-002.

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

A second cookie, `__Host-ident_login`, carries the login binding for the length of a
sign-in: the same attributes, with `Max-Age=600`. It confers nothing but the right to
complete the sign-in it was issued for, and it is cleared by the callback.

Both cookies are bound to the exact host, so the BFF answers only on the public origin's
host. A page request under another name for the same process, such as `localhost` where
the origin is `127.0.0.1`, is redirected there with `308` before anything else runs. Any
other request is refused. Without this, a browser on the other name would be signed out
there, and a sign-in started there would fail at the callback. `/healthz` and
`/auth/back-channel-logout` are exempt, because their callers are an orchestrator and the
identity kernel, which reach the BFF on internal addresses.

### Sign-In Scopes

A sign-in asks for `openid scnehaux-provider scnehaux-profile`. `scnehaux-provider` is the
privileged provider-scope profile the Identity Control API accepts (STD-IAM-002 §3.1.1).
`scnehaux-profile` writes `name` and `preferred_username` into the ID token and never into the
access token, which carries no personal data (STD-IAM-002 §3.2). The session's display name is read
from the ID token alone, `name` first and `preferred_username` second.

The kernel refuses a sign-in that asks for a scope the client does not hold. identity-control
registers a confidential client with `scnehaux-profile` as an optional scope
(TDD-identity-control-003 §Profiles); a BFF client adopted before that holds it once an operator
applies its registered state. So this change is deployed after the BFF's client holds the scope.

### Server-Side Session

```text
id_hash              SHA-256 of the cookie value; the store never holds the value
subject              Keycloak subject, for back-channel logout by subject
principal_id         enterprise reference from the ID token
display_name         name shown in the application, from the ID token's name or preferred_username
keycloak_session_id  Keycloak `sid`, for back-channel logout correlation
tokens               access and refresh token, sealed; never serialized to the browser
access_expires_at    when the access token lapses, for refresh
acr                  authentication context reached
auth_time            when authentication occurred
csrf_token           per-session value, delivered to the browser and echoed in a header
created_at
last_seen_at
absolute_expires_at  created_at + 8 hours
idle_expires_at      last_seen_at + 30 minutes, never past absolute_expires_at
```

Two expiries, because they bound different risks. Idle expiry limits an unattended
workstation; absolute expiry limits a stolen session identifier regardless of
activity. A request through the proxy is activity; reading `GET /auth/session` is not,
so a tab left open that only re-reads its display context still goes idle.

The row is keyed by the digest of the cookie, so a copy of the table cannot be replayed
as a cookie. The tokens are sealed with AES-256-GCM under
`IDENTITY_EXPERIENCE_SESSION_KEY`, which the database never sees, with the row's key as
associated data, so a sealed value moved to another row does not open. The ID token is
validated at sign-in and not kept: nothing after sign-in needs it, and a session holds
no credential it does not use. The active Tenant (`tenant_id`) arrives with the context
switch; the provider-scope sessions built first carry none, per STD-IAM-002 §3.1.

A sign-in in flight is a second table, `login_states`: the binding's digest, `state`,
`nonce`, the sealed PKCE verifier, `return_to` and an expiry.

The store is server-side and shared across BFF replicas so a session survives a
replica restart and a load-balancer decision. It is PostgreSQL: a database of the BFF's own,
reached by a role that holds DML on the session table and nothing else. The administrator
population is small, so one indexed lookup per request fits the proxy budget, and a
store that survives restarts needs no second persistence technology beside the ones the
estate already operates.

Migrations are a separate step, `pnpm --filter @identity-experience/bff migrate`, run as
the owning role (`IDENTITY_EXPERIENCE_MIGRATION_DATABASE_URL`); it grants the serving role
(`IDENTITY_EXPERIENCE_RUNTIME_ROLE`) its DML. The serving process never runs DDL. Rows
past their expiry are refused when presented and purged every five minutes.

## Runtime

The BFF is TypeScript on Node.js, as SAD-002 §3 fixes for every container in this
repository, on Fastify. It also serves the built browser applications, so the browser
reaches one origin: the session cookie, the content security policy and the API proxy
all apply to each. The Identity Admin Portal is served at `/`. The Developer Identity
Console is served under `/developer/` from its own build, when the deployment names one
(`TDD-identity-experience-004` §Delivery). Its hashed assets, its shell and its
client-side routes are answered from that build, `/developer` redirects to `/developer/`,
and every other page path is the Admin Portal's. Each application is rendered client-side,
per STD-GLB-FE-001 §3 for authenticated administrative portals, and is built with Vite.

One BFF serves both because SAD-002 §4.1 gives both the same BFF, and one origin is what
keeps one session: a second origin would need a second session cookie, a second sign-in
and a second CSRF token for the same person. The two applications differ in what the
Identity Control API authorizes for the session's token, not in how the session is held.

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

`GET /auth/session` returns the current display context: principal identifier, display
name, active tenant once the context switch exists, assurance level, expiry hints, and
the session's CSRF token. It returns no token and no credential. With no valid session it
answers `{"authenticated": false}`.

`POST /auth/logout` ends the BFF session and the Keycloak session, both server-side: the
BFF calls Keycloak's logout endpoint as the confidential client, with the session's
refresh token. It answers `204` and gives the browser nothing to carry. RP-initiated
logout through the browser was rejected because it needs the ID token in a URL the
browser holds (`id_token_hint`), which §What the BFF Must Not Do forbids. If Keycloak
does not confirm, the BFF session is ended regardless and the failure is logged.

`POST /auth/back-channel-logout` validates the logout token per OpenID Connect
Back-Channel Logout 1.0 §2.6 — PS256 signature, issuer, audience, `iat` within two
minutes, the logout event, no `nonce` — and ends the sessions of the named `sid`, or of
the `sub` when no `sid` is given. It is exempt from the CSRF checks: no browser and no
cookie is involved, and the signed token is the authentication.

`ALL /api/*` proxies `/api/v1/*` to the Identity Control API. The proxy attaches the
access token from the session and forwards nothing the browser supplied as authority:
only `Accept`, `Content-Type`, `Idempotency-Key`, `X-Administrative-Reason`, `If-Match`
and `If-None-Match` pass, never `Authorization` or `Cookie`, and no upstream `Set-Cookie`
comes back. A path that would resolve outside `/v1/` — a dot-segment, or an encoded slash
or backslash in any segment — is refused before any session is read.

`POST /auth/step-up` and `POST /auth/context` are built with the screens that need them.

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
        lock the session row; if another request refreshed meanwhile, use its tokens
        refresh server-side using the stored refresh token
        on success: replace both tokens in the session
        on refusal: destroy the session, clear the cookie, respond 401
        on outage: keep the session, respond 503
```

Refresh is invisible to the browser and never triggers a redirect for an active user.

The row lock matters because Keycloak can rotate refresh tokens. Two requests that find
the same access token near expiry would otherwise both refresh, and the second would
present a spent refresh token and end a healthy session.

A refusal is an OAuth error response from the token endpoint, such as `invalid_grant`
when the Keycloak session is gone. An outage is no answer, or a 5xx. Only a refusal
destroys the session: ending every open session because the identity kernel was
unreachable for a minute would turn an outage into a mass sign-out.

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
- It never returns an access token, refresh token, ID token, client private key, or client
  secret to the browser, on any endpoint, including diagnostics.
- It never accepts a Tenant identifier from the browser as authority; a requested
  context is validated against the session and the API.

STD-IAM-001 §3.9 states the reason directly: UI authorization is defence in depth and
user-experience control only.

## Configuration

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `IDENTITY_EXPERIENCE_PUBLIC_ORIGIN` | none, required | Exact origin the browser uses; what the `Origin` check compares against |
| `IDENTITY_EXPERIENCE_WEB_ROOT` | none, required | The built Identity Admin Portal, served at `/` |
| `IDENTITY_EXPERIENCE_DEVELOPER_WEB_ROOT` | none | The built Developer Identity Console, served under `/developer/`. Unset, the console is not served and its paths are the Admin Portal's |
| `IDENTITY_EXPERIENCE_ISSUER` | none, required | Expected `iss`, validated on every ID token; `https` except on the developer's own machine |
| `IDENTITY_EXPERIENCE_KEYCLOAK_INTERNAL_URL` | the issuer | Where the token, key and logout endpoints are reached server to server |
| `IDENTITY_EXPERIENCE_CLIENT_ID` | none, required | Confidential client identifier |
| `IDENTITY_EXPERIENCE_CLIENT_KEY_FILE` | none, required | The client's private key as a PEM file (RSA ≥ 3072), mounted from the approved secret manager. Its `kid` is its thumbprint |
| `IDENTITY_EXPERIENCE_REDIRECT_URI` | none, required | Exactly registered, no wildcard; must be the public origin's `/auth/callback` |
| `IDENTITY_EXPERIENCE_SESSION_KEY` | none, required | 32 bytes, base64; seals the tokens a session row holds |
| `IDENTITY_EXPERIENCE_DATABASE_URL` | none, required | Session store, as the DML-only serving role |
| `IDENTITY_EXPERIENCE_SESSION_IDLE` | `30m` | Idle expiry |
| `IDENTITY_EXPERIENCE_SESSION_ABSOLUTE` | `8h` | Absolute expiry |
| `IDENTITY_EXPERIENCE_REFRESH_SKEW` | `30s` | Refresh ahead of expiry |
| `IDENTITY_CONTROL_BASE_URL` | none, required | Identity Control API |
| `IDENTITY_EXPERIENCE_UPSTREAM_TIMEOUT` | `10s` | Bound on one proxied call |
| `IDENTITY_EXPERIENCE_LISTEN_HOST`, `_LISTEN_PORT` | `0.0.0.0`, `8080` | Listening address |

The migration step reads `IDENTITY_EXPERIENCE_MIGRATION_DATABASE_URL` (the owning role)
and `IDENTITY_EXPERIENCE_RUNTIME_ROLE` (the role granted DML); the server reads neither.

Keycloak states one issuer whatever address it is reached on, so the server metadata is
written out rather than discovered: the browser is sent to the issuer's authorization
endpoint, the token, key and logout endpoints are called on the internal address, and
every token is still validated against the public issuer.

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
  token, ID token, client secret, or private key, asserted by scanning every endpoint
  response and the built artifact.
- The token and logout requests carry a PS256 assertion signed by the registered key,
  each with a fresh `jti`, and no `client_secret` and no `Authorization: Basic` header,
  asserted against the identity provider mock.
- A client key file that is missing, unreadable, or below 3072 bits is a configuration
  error that names the problem and never the key.
- `localStorage` and `sessionStorage` hold no credential after a full sign-in flow.
- A session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefixed, and
  carries no encoded state.
- The session store holds neither a cookie value nor a token in plaintext.

### Sign-in Correctness

- A callback with a mismatched `state` is rejected.
- A callback in a browser that did not start the sign-in, a replayed callback, and an
  expired sign-in are rejected.
- An authorization response carrying another issuer's `iss` is rejected.
- An ID token with a mismatched `nonce`, wrong `iss`, wrong `aud`, past `exp`, a
  signature by a key the realm does not publish, or an `RS256` signature is rejected.
- The authorization request uses PKCE with `S256`.
- Sign-in issues a new session identifier and ends one the browser held before.
- `return_to` off this origin returns to the root.
- A sign-in started from the Developer Console that does not complete lands on
  `/developer/` with its marker; one with no pre-session in this browser lands on `/`.
- A redirect URI not exactly registered is refused by Keycloak.

### Cross-Site Request Forgery

- A state-changing request with a foreign `Origin` is rejected.
- A state-changing request with no `Origin` is rejected.
- A state-changing request with a missing or wrong CSRF token is rejected.
- A cross-site form post carrying the session cookie is rejected.

### Revocation

- After Keycloak session removal, the next server-side refresh fails and the session
  is destroyed.
- An identity kernel outage during refresh answers 503 and keeps the session.
- Concurrent requests that find the token near expiry refresh once.
- Back-channel logout destroys the matching session and no other.
- A 401 from the Identity Control API destroys the session.
- Measured time from Membership revocation to session destruction stays within the
  remaining access token lifetime of class `L0`.

### Session Lifetime

- Idle beyond `SESSION_IDLE` invalidates the session.
- A continuously active session ends at `SESSION_ABSOLUTE` regardless of activity.
- A session survives a BFF replica restart and a load-balancer change.

### Serving the Applications

- `/developer/` and the console's client-side routes answer with the console's shell, never
  cached, and its assets come from its own build; `/developer` redirects to `/developer/`.
- Every other page path answers with the Admin Portal's shell, `/developers` included.
- With no console build named, nothing is served from a console build.

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

Client authentication makes this a confidential client, which is what permits refresh
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
failure, client key rotation, and suspected session fixation.

## Traceability

| Relationship | Target |
| :-- | :-- |
| Parent system | SAD-002 — Scnehaux Identity Experience |
| Realizes capability | PAD-PLT-001 — Identity & Access Platform |
| Governed by | ADR-IAM-001 — Adopt Keycloak Identity Kernel |
| Conforms to | STD-IAM-001 §3.9 — no browser-held refresh tokens; BFF session control for privileged experiences |
| Conforms to | STD-IAM-001 §3.2 — Authorization Code with PKCE `S256`; confidential client authentication by `private_key_jwt` |
| Governed by | ADR-IAM-001 §5.12 — confidential clients authenticate with registered keys |
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
