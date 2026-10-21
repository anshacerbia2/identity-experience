---
doc_meta:
  id: TDD-identity-experience-001
  title: Backend-for-Frontend Session and Browser Security
  owner: Identity Experience Team
  version: 1.24.0
  status: approved
  classification: restricted
  review_cycle_days: 90
  created_date: 2026-08-11
  last_reviewed: 2026-10-21
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
key file is the only configuration it needs. The client has no secret: STD-IAM-001 §3.2 allows none
in any shared environment.

**The BFF's client is a registration** (1.14.0), confidential and `privileged` in the
`provider-scope` form (TDD-identity-control-003 1.29.0). It is not `internal`: the Admin Portal's
calls are provider routes, which need the `acr` and `auth_time` of `scnehaux-provider`
(STD-IAM-002 §3.1.1). A new server registers it with `POST /v1/registrations`, holding the
developer's public key and `identity-control-api` in its audience. On the development server,
`deploy/dev/create-bff-client.sh` created it before Identity Control could register a confidential
client. That client is adopted, a plan first, by identity-control's `scripts/dev-adopt-bff.ps1`
(its `deploy/dev/README.md` §Adopting the BFF). Until it is, the registration sweep reports it
`unmanaged`, and the server cannot disable unmanaged clients without disabling the BFF.

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
| `LogoutController` | Back-channel logout receiver, sign-out, global sign-out. No front-channel logout (§No Front-Channel Logout) |
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
is logged as an outage, and the application says the sign-in service could not be reached and that
trying again may work. A session store that does not answer during `/auth/login` or the callback
lands the same way (1.17.0, §Session-Store Outage). The first failed sign-in against the development kernel was
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

**A Tenant sign-in asks for `openid scnehaux-privileged organization:<tenant_id> scnehaux-profile`
instead (1.15.0, ADR-IAM-008 §5.2).** It is the tenant-scoped form: the same claims, and the
`tenant_id` the kernel issues only for a member (ADR-IAM-006 §5.2). Each sign-in names exactly one
form, never both and never a second Tenant. Only an application whose client is registered for the
`per-sign-in` form can ask for one (STD-IAM-002 1.7.0 §3.1.1). This BFF's clients are
provider-scope, so it keeps tenant sign-in off (§Context Switch).

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
tenant_id            the Tenant the tokens were issued for; null for the provider-scope form (1.15.0)
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
no credential it does not use.

**A row that does not open is no session (1.17.0).** AES-GCM refuses a sealed value altered, moved to
another row, or sealed under another key, and the BFF cannot tell these apart. All three mean the
row's tokens cannot be used, so the request has no valid credential: the BFF answers as it does for
no session at all, `401` with the cookie cleared, `{"authenticated": false}` from `/auth/session`, and
a sign-in that starts again (RFC 9110 §15.5.2 [R10]). A sign-in in flight whose verifier does not open
is one that cannot complete, and lands on `?sign-in=failed`. Before 1.17.0 the error reached the
error handler and every open session answered `500` after `IDENTITY_EXPERIENCE_SESSION_KEY` changed.
The row is not deleted: a replica configured with a wrong key would otherwise delete the sessions every
other replica reads. It lapses at its expiry and the purge removes it. A key changed on purpose is
changed with the tables emptied (`docs/runbooks/suspected-session-fixation.md`), which makes the
sign-out final; putting the old key back would otherwise open the rows again. The BFF holds one key
and no key ring, so changing it always signs everyone out.

The active Tenant (`tenant_id`) is the one the sign-in asked for and
the ID token confirmed (§Context Switch); a provider-scope session holds none, per STD-IAM-002
§3.1.1.

A sign-in in flight is a second table, `login_states`: the binding's digest, `state`,
`nonce`, the sealed PKCE verifier, `return_to`, an expiry, and what the callback holds the ID token
to: `max_age`, `acr_values` and `tenant_id`.

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

**The record ends with its session (1.23.0, `STD-IAM-001` 3.0.0 §3.4).** The standard asks that the
store delete a record at the earliest of the absolute timeout, the idle timeout, logout and revocation,
and that the deletion be "the store's own (an expiry on the record), not only a refusal when the record
is read". The store conforms, and the evidence is these:

- **An expiry on the record.** `sessions.idle_expires_at` and `sessions.absolute_expires_at`
  (`bff/migrations/0001_sessions.sql`, both indexed). The idle expiry never passes the absolute one
  (`bff/src/session/sessions.ts`, `#idleExpiry`).
- **Idle and absolute timeout.** `SessionStore.purgeExpired` deletes every row past either expiry, and
  `bff/src/server.ts` runs it every five minutes, so a row nobody presents again is still deleted.
  A presented one is destroyed on the way out (`Sessions.resolve`). Tests: `bff/test/auth.test.ts`,
  "session lifetime": the idle and absolute refusals, and, since 1.23.0, the purge deleting an expired
  row that was never presented and keeping a live one.
- **Logout and revocation.** `SessionStore.destroy` on sign-out, `destroyForLogout` on a back-channel
  logout (`bff/test/auth.test.ts`, the back-channel logout cases; `bff/test/containment.test.ts`).
- **Not an authority.** The store holds nothing that is not rebuilt by a sign-in (§Backups).

## Runtime

The BFF is TypeScript on Node.js, as SAD-002 §3 fixes for every container in this
repository, on Fastify. It also serves the built browser applications, so the browser
reaches one origin: the session cookie, the content security policy and the API proxy
all apply to each. The Identity Admin Portal is served at `/`. The Developer Identity
Console is served under `/developer/` from its own build, when the deployment names one
(`TDD-identity-experience-004` §Delivery). The account security experience is served under
`/account/` from its own build in the same way (`TDD-identity-experience-002` §Delivery). For
each, its hashed assets, its shell and its client-side routes are answered from its build, the
path without its slash redirects to the one with it, and every other page path is the Admin
Portal's. Each application is rendered client-side,
per STD-GLB-FE-001 §3 for authenticated administrative portals, and is built with Vite.

One BFF serves all three because SAD-002 §4.1 gives them the same BFF, and one origin is what
keeps one session: a second origin would need a second session cookie, a second sign-in
and a second CSRF token for the same person. The applications differ in what the
Identity Control API authorizes for the session's token, not in how the session is held.

**Why one BFF is the pattern applied correctly, not a shortcut.**
- **Sam Newman's rule is "one experience, one BFF".** It allows a shared BFF where experiences are
  alike and one team owns them: "if the iOS and Android experiences are very similar, then it is
  easier to justify having a single BFF", and "team structure should drive how many BFFs you have"
  [R3]. Here all three applications run in the same browser, on the same origin, and belong to one
  team: every TDD in this repository is owned by the Identity Experience Team.
- **This BFF does not shape a different API for each application.** It is the IETF's
  security BFF: "a component of the frontend application" that "relies on browser cookies to keep
  track of the user's session, which is used to access the user's tokens". The IETF "strongly
  recommended [it] for business applications, sensitive applications, and applications that handle
  personal data" [R4]. Its work is the same for every application: sign-in, token custody,
  refresh, CSRF and an unchanged proxy. One application cannot ask it for anything another cannot.
- **Products ship the same arrangement.** Duende's BFF serves several frontends from one instance,
  "identified either via path based routing and/or host selection". It gives the reason that "having
  a dedicated backend service for each frontend introduces quite a lot of operational overhead"
  [R5].

**What would split it.** Duende lets each frontend "define its own Cookie settings" [R5], and that
is the boundary to watch. If the Portal comes to need a session policy the account application must
not have, the frontends get their own session settings, and a second BFF follows only if their
release or ownership diverges. A shorter idle timeout or a stronger `acr` for administration would be
such a policy. Authority would not be, because the Identity Control API already decides it per route
class.

## API / Interface

The applications call identity-control through `/api/*` with a hand-written client, contract-tested
against identity-control's published `api/openapi.yaml` (1.21.0, `ADR-GLB-010` §5.1;
`TDD-identity-experience-003` 1.32.0 §The Client Is Contract-Tested). The BFF forwards those calls and
changes none of them, so it is not part of that contract. Its own two calls are: the enrolment
routes it sends as its enrolment workload (1.24.0, §Enrolment From an Invitation), whose paths and
bodies the same contract test reads from `bff/src/enrolment/`.

### BFF Endpoints

```text
GET   /auth/login            ?return_to=&max_age=&acr_values=&kc_action=&tenant=
GET   /auth/callback
POST  /auth/logout
POST  /auth/back-channel-logout
GET   /auth/session
POST  /auth/enrolment          no session: the enrolment page (1.24.0, §Enrolment From an Invitation)
POST  /auth/enrolment/verify   no session: the enrolment page (1.24.0)
ALL   /api/*
```

`GET /auth/session` returns the current display context: principal identifier, display
name, the active Tenant (`tenantId`, null for the provider-scope form), assurance level, expiry
hints, and the session's CSRF token. It returns no token and no credential. With no valid session it
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

Neither step-up nor the context switch has an endpoint of its own. Step-up is a sign-in with
`max_age` (§Step-Up), and a context switch is a sign-in with `tenant` (§Context Switch). 1.15.0
drops the `POST /auth/context` this design reserved, because a switch needs a navigation to the
kernel anyway.

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
is revoked, `identity-control` removes the Principal from the Tenant's Organization in
the kernel, and removes no session (`ADR-IAM-006 §5.5`). The kernel then refuses the
next refresh of a session for that Tenant with `invalid_grant`, and this BFF destroys
the session. When a Keycloak session is removed, the next refresh fails the same way.
That is the second of the four revocation mechanisms reaching a browser tab (1.19.0:
until then this paragraph said a Membership revocation removed the Keycloak session).

### Session-Store Outage

Every signed-in request reads the session store. A store that does not answer is an outage, and the
BFF answers it as it answers an identity kernel that does not answer: the session is kept, and the
browser is told to try again (1.17.0).

```text
the store classifies what the driver throws:
    no connection, a dropped one, a pool timeout                      outage
    a server error of SQLSTATE class 08, 53, 57 or 58                  outage
    any other server error (42P01 no table, 28P01 refused login, …)   fault, 500
on an outage:
    /api/*, /auth/session, /auth/logout     503 dependency-unavailable; the cookie is not cleared
    /auth/login, /auth/callback             302 to ?sign-in=unavailable at the application's root
    /auth/back-channel-logout               400, no body
```

- **Why 503.** RFC 9110 §15.6.4 defines it for a server "currently unable to handle the request due to
  a temporary overload or scheduled maintenance, which will likely be alleviated after some delay"
  [R9]. A store outage is that. `500` says the server met "an unexpected condition" and gives the
  browser no reason to try again; before 1.17.0 every store failure answered it. STD-GLB-005 permits
  retrying a `503` and forbids retrying a `4xx`, so the class matters to a caller.
- **No `Retry-After`.** RFC 9110 makes it optional ("MAY"), and its value states "how long the service
  is expected to be unavailable" [R9]. The BFF does not know. STD-GLB-005 requires one only on a shed
  or rate-limited request, which this is not, and the kernel outage path sends none either.
- **The class, not the code.** PostgreSQL's appendix: "the first two characters of an error code
  denote a class of errors … an application that does not recognize the specific error code might
  still be able to infer what to do from the error class" [R11]. Classes 08 connection exception, 53
  insufficient resources, 57 operator intervention and 58 system error are the server unable to work
  now. A missing table or a refused login is the deployment's fault and stays `500`, so an empty
  database is not mistaken for a passing outage.
- **Sign-in is a navigation.** A `503` problem document would render as text in the browser, so
  `/auth/login` and the callback land where the application offers to try again, as for the kernel.
- **Back-channel logout answers `400`.** OpenID Connect Back-Channel Logout 1.0 §2.8: "If the logout
  request was invalid or the logout failed, the RP MUST respond with HTTP 400 Bad Request" [R12]. The
  refresh path ends the session within one access token lifetime once the store answers.
- **Sign-out keeps the cookie** when the row could not be deleted, so the same sign-out can be repeated.
- **A path that does not answer it itself**, such as the proxy ending a session after the API's `401`,
  reaches the error handler, which answers the same `503`.

`docs/runbooks/session-store-outage.md` is the operator's side.

### How a Revocation Reaches an Open Tab

The BFF is affected by three of the four mechanisms, at three different latencies:

| Mechanism | Effect here | Latency |
| :-- | :-- | :-- |
| Keycloak session removed | The next server-side refresh fails and the session is destroyed | Up to the remaining access token lifetime, four minutes at class `L0` |
| Membership revoked, for a Tenant session | The kernel refuses the next refresh for that Tenant, and the session is destroyed. No kernel session ends, so no back-channel logout is sent (1.19.0) | The propagation to the kernel, plus the remaining access token lifetime |
| Back-channel logout | Keycloak notifies the BFF directly; the session is destroyed immediately | Propagation time |
| Control API rejects the token | The proxied request returns 401 and the session is destroyed | Next request |

Back-channel logout is the fast path and is registered for exactly that reason. The
refresh path is the guaranteed one: it requires no callback to arrive and no request
to be made, so it bounds the interval even when the browser is idle and the
notification is lost.

**Where the URL is registered (1.18.0).** The BFF's client is registered through identity-control's
`POST /v1/registrations` with `backchannel_logout_uri` set to this BFF's `/auth/back-channel-logout`
on an address the kernel's container reaches, or adopted declaring it (`TDD-identity-control-003`
1.37.0). identity-control writes it with front-channel logout off and "session required" on, so the
logout token names the session by `sid`, and its drift sweep holds both. identity-control's
`deploy-dev` proves a client registered that way receives a PS256 `logout+jwt` naming the session the
API ends. A BFF on a developer's machine registers none: the specification requires the URI to be
"reachable from all the OPs used", and the kernel cannot reach the laptop (`ADR-IAM-009 §5.3`). There,
the refresh path alone bounds the session, as it bounds every session.

### No Front-Channel Logout

1.0.0 named front-channel logout among `LogoutController`'s duties and specified no endpoint for it.
1.18.0 removes it, by `ADR-IAM-009 §5.2`, and the BFF keeps its `frame-ancestors 'none'` and its
`SameSite=Lax` cookie:

- **The kernel ends sessions without a browser.** A person's own session end, a provider's
  containment and a suspension all remove the session through the Admin API. The pinned kernel tells
  a client of such a removal only by the back channel; front-channel logout reaches a client only
  "when the logout is triggered in the same browser session" (`ADR-IAM-009` [R3]).
- **The two are exclusive per client.** Keycloak 26.7.5 skips the back channel for a client with
  front-channel logout on (`ADR-IAM-009` [R4]), so turning it on would remove the notification an
  administrative removal sends.
- **The frame would be refused, and could not read the session.** Front-channel logout renders the
  logout URI in an iframe on the kernel's page, which this BFF's `frame-ancestors 'none'` refuses; a
  `SameSite=Lax` cookie is not sent on navigations inside an iframe, and browsers partition or block
  cross-site frame storage (`ADR-IAM-009` [R5]–[R7]). The specification says so of itself: the logout
  URI "might not be able to access the RP's login state when rendered by the OP in an iframe"
  (`ADR-IAM-009` [R1]).

A sign-out here still reaches every other relying party of the kernel session: the BFF ends it at the
kernel's logout endpoint, which sends the back channel to the session's other clients
(`ADR-IAM-009 §5.4`).

A tab whose session is destroyed receives 401 on its next call and redirects to
sign-in. The design does not attempt to push a notification into an idle tab, because
an idle tab makes no request and therefore exercises no authority.

### Step-Up

The Identity Control API declares when a command needs a fresher authentication. It answers `401`
with `WWW-Authenticate: Bearer error="insufficient_user_authentication", max_age=N`
(`TDD-identity-control-005` §Step-Up). RFC 9470 §4 says what a client does with that: it "SHOULD
parse the WWW-Authenticate header for acr_values and max_age and use them, if present, in
constructing an authorization request" [R1].

```text
proxy, on an upstream 401:
    if WWW-Authenticate carries error="insufficient_user_authentication":
        keep the session; pass the 401, its problem document and WWW-Authenticate through
    else:
        destroy the session, as §How a Revocation Reaches an Open Tab says

application, on that 401:
    offer "sign in again to continue", a navigation to /auth/login?max_age=N&return_to=<here>

/auth/login with max_age:
    send max_age in the authorization request; keep it with the sign-in in flight
/auth/callback:
    require the ID token's auth_time within max_age of now, as openid-client checks it
    start a new session, as every sign-in does
```

- **The session is kept on a step-up challenge.** This 401 says the authentication is too old for
  this command. It does not say the token is refused, so ending the session would sign out an
  operator who did nothing wrong. Every other 401 still ends the session.
- **Step-up is a sign-in, not a separate endpoint.** OpenID Connect gives `max_age` the exact
  meaning needed: "If the elapsed time is greater than this value, the OP MUST attempt to actively
  re-authenticate the End-User", and "the ID Token returned MUST include an auth_time Claim Value"
  [R2]. A sign-in already binds the callback to the browser and replaces the session identifier, so
  the step-up gets those properties without new code. `max_age` is an integer from 0 to 86400; any
  other value is ignored, and the sign-in goes ahead without it.
- **`acr_values` is sent (1.10.0).** `ADR-IAM-004` names the levels `aal1` and `aal2`, and the kernel
  maps them (TDD-identity-kernel-001 §Authentication Levels).
  - The application reads `acr_values` from the challenge beside `max_age`, and passes both to
    `/auth/login`.
  - The BFF accepts `aal1` or `aal2`, ignores any other value, sends the level in the authorization
    request, and keeps it with the sign-in in flight.
  - The callback refuses an ID token whose `acr` is below the level asked for, in STD-IAM-002 §3.2's
    order. The kernel decides how a person reaches the level; the BFF checks that it was reached.
- **The Admin Portal signs in at `aal2`.** Every route a provider uses requires it
  (`TDD-identity-control-005` §Step-Up). So a sign-in that returns to the Portal, with no level of its
  own, asks for `aal2`. A provider then meets the second factor once per sign-in rather than at the
  first page (`ADR-IAM-004 §5.3`). A sign-in returning to the Developer Console or the account
  application asks for no level. This is the BFF's rule, by where the sign-in returns, and the browser
  cannot lower it.
- **An application-initiated action (1.11.0, 1.12.0, 1.13.0).** `/auth/login` passes `kc_action` to
  the kernel only for an action on its allowlist: `CONFIGURE_TOTP`, since 1.12.0 `webauthn-register`
  [R7], and since 1.13.0 `CONFIGURE_RECOVERY_AUTHN_CODES`, a new set of recovery codes
  (`ADR-IAM-005 §5.3`). Any other value is ignored, `webauthn-register-passwordless` included, because no realm flow
  admits a passkey as a first factor (`TDD-identity-control-005` 2.7.0).
  - The account application asks for the action after the Identity Control API authorized the
    enrollment (`TDD-identity-control-005` §Enrollment and the Assurance Floor). The kernel performs
    it on its own pages.
  - Keycloak reports the action's outcome as `kc_action_status`, `success` or `cancelled`. It calls
    `kc_action` and `kc_action_status` "a Keycloak proprietary mechanism unsupported by the OIDC
    specification" [R6].
  - The callback carries an allowlisted outcome onto the return address, so the page can say it.
    The sign-in itself completes as any other, with a new session.
- **A read is challenged too.** A provider route answers a read below `aal2` with the challenge. The
  read's error panel offers the same "sign in again to continue", so a page that loads data shows the
  way forward rather than an error.
- **The browser never decides the requirement.** The application reads `max_age` from the API's
  challenge, which the BFF passes through. A request that sets `max_age` itself only makes its own
  sign-in stricter.
- **What the command keeps.** The page is reloaded after the sign-in, so the command's form is
  filled in again. The application keeps no reference or reason in browser storage (TDD-003 §Data
  Model).

### Context Switch

**The active Tenant is chosen per sign-in (1.15.0, ADR-IAM-006 §5.2, ADR-IAM-008).**
`GET /auth/login?tenant=<tenant_id>` asks for the tenant-scoped form for that Tenant. A sign-in
without `tenant` asks for the provider-scope form. The flow:

1. **The identifier is a selector, never authority.** It must be a lowercase UUID, the form the
   Organization Control API issues. Anything else is refused at `/auth/login`, not dropped, because
   dropping it would sign the operator in to the provider-scope form instead of the Tenant they
   chose. An application whose client holds one form keeps tenant sign-in off, and refuses any
   `tenant`.
2. **The kernel admits only a member.** It refuses `organization:<tenant_id>` for anyone else
   (ADR-IAM-006 §5.2).
3. **The callback holds the ID token to the request,** as it holds `acr` to the level asked for:
   - a Tenant sign-in whose ID token names another Tenant, or none, is refused;
   - a provider sign-in whose ID token names one is refused.

   This is the check Auth0 asks of a client on its organization claim [R8].
4. **The session holds the Tenant the ID token confirmed.** `GET /auth/session` shows it.
5. **Switching is a new sign-in,** a redirect round trip on the existing Keycloak SSO session, not a
   credential prompt. Like every sign-in it issues a new session and ends the one before. The
   previously issued tokens are discarded with it.

**A refresh keeps the Tenant** (ADR-IAM-006 §5.2). A refresh whose ID token names another Tenant,
or none, is treated as a refused refresh: the session ends (§Refresh). A Membership removed or a
Tenant disabled makes the kernel refuse the refresh outright.

A Tenant the operator does not administer is still refused by the Control API, which checks
current state on every request. The BFF surfaces the refusal rather than retrying.

### Enrolment From an Invitation (built 1.24.0, ADR-IAM-011)

**Built in 1.24.0.** `ADR-IAM-011` §5.1 to §5.9 (accepted 2026-10-20, amended twice on 2026-10-21) and
`STD-IAM-001` 3.1.0 §3.1. Its §5.6 gives this repository "The enrolment page and its anonymous BFF
routes: the code form, and the temporary password shown once with `no-store`". The producer is
identity-control's `POST /v1/enrolments` and `:verify` (`TDD-identity-control-001` 1.27.0 §Enrolment
From an Invitation, its `api/openapi.yaml` 1.2.0, identity-control #118), pinned in
`contracts/identity-control/`. Nothing here grants a Membership: the person signs in with the temporary
password, chooses their own, and accepts the invitation from its link, signed in, as `ADR-ORG-007 §5.1`
decides (§5.4).

```text
browser                         BFF                                   identity-control
/account/enrol#<token>
POST /auth/enrolment {token}  ->  workload token, Forwarded: for=<a>  -> POST /v1/enrolments {token}     -> 202 {enrolment_id}
POST /auth/enrolment/verify   ->  workload token, Forwarded: for=<a>  -> POST /v1/enrolments/{id}:verify -> 201, once
     {enrolment_id, code}
```

**The page's address: `/account/enrol`, with the token in the fragment.** organization-experience's
acceptance page links to `https://<this BFF's public origin>/account/enrol#<token>`, the token
percent-encoded, as its own invitation link carries it (`/invitations/accept#<token>`). The page is a
route of the account application (`TDD-identity-experience-002`), served by this BFF without a sign-in.
On the development laptop it is `http://127.0.0.1:8090/account/enrol#<token>`.

**The token in the fragment.** A browser separates the fragment before it asks a server for anything:
RFC 3986 §3.5, "the fragment identifier is separated from the rest of the URI prior to a dereference"
[R14]. So no server, this BFF included, receives the token when the link opens, and no access log holds
it.

- `apps/account/src/core/invitation-fragment.ts` is the first module `main.tsx` imports, so it runs
  before the router reads the location. On `/account/enrol` it takes the fragment, decodes it, and
  removes it from the address bar with `history.replaceState`, which loads nothing. No link, sign-in
  `return_to` or history entry the page makes afterwards can carry it.
- The token is held in that module's memory alone: never in browser storage, a cookie or a URL. A
  reload has no token, and the page asks the person to open the link again. It is sent only in the body
  of `POST /auth/enrolment`, and dropped once the account exists.
- `Referrer-Policy: no-referrer` (§Security Headers) holds on every response, and the page's requests
  set `referrerPolicy: 'no-referrer'` too, so no `Referer` carries the page's address.

**The BFF calls enrolment as its own workload.** The routes are anonymous as to the person and not as
to the caller (`ADR-IAM-011 §5.8`). The BFF holds a second client, the enrolment workload, beside its
sign-in client:

- **Its own registration and key.** `IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_ID` and
  `_CLIENT_KEY_FILE` (§Configuration). A workload Principal with an owner (`ADR-IAM-003 §5.8`), created
  through identity-control's `POST /v1/workloads`, and admitted to the two routes by its enrolment
  caller record (`POST /v1/enrolment-callers`, `TDD-identity-experience-003` 1.35.0 §Enrolment
  Callers). One per deployment, and one per developer device, as `STD-GLB-009` rule 15 says: "Each
  device sets its own `*_CLIENT_ID` and key". The configuration refuses the sign-in client's identifier
  or key for it, so a lost device's caller is retired without touching its sign-in, and the other way
  round. `scripts/dev-wire-enrolment.ps1` registers it from zero (`deploy/dev/README.md`, First start
  step 4).
- **Its token.** An OAuth client credentials grant at the kernel's token endpoint, authenticated by a
  PS256 assertion signed with the workload's key (`private_key_jwt`, `ADR-IAM-001 §5.12`), never a
  secret (`bff/src/enrolment/workload-token.ts`). It is held in memory until 30 seconds before it
  expires, and dropped when identity-control answers `401`, so the next request presents a fresh one;
  that request is not retried. It is never logged, stored or sent to the browser.
- **No person's token.** No one is signed in, and a session cookie the browser happens to hold is
  not read on these routes.

**The client address (§5.8).** identity-control counts requests per client address, from the
`Forwarded` header it reads on this workload's call alone. RFC 7239 §5.2: "The "for" parameter is used
to disclose information about the client that initiated the request" [R15]. §8.1: the header "cannot be
relied upon to be correct, as it may be modified, whether mistakenly or for malicious reasons, by every
node on the way to the server" [R15]. So the BFF states the address the platform's own edge accepted,
and trusts one hop and no chain behind it (`bff/src/enrolment/client-address.ts`):

- **Nothing in front** (`IDENTITY_EXPERIENCE_TRUSTED_INGRESS` unset, as on a laptop): the BFF is the
  edge, and the address is that of the TCP connection it accepted.
- **One ingress in front** (`IDENTITY_EXPERIENCE_TRUSTED_INGRESS` its address or CIDR range): on a
  connection from it, the address is the one `X-Forwarded-For` value the ingress wrote. The ingress
  overwrites any forwarding header a client sent (§Deployment Edge, below), so the header holds one
  address. A list, a second header, a value that is not an address, or no header is a misconfigured
  ingress: the BFF answers `503` and logs it, and sends nothing. On a connection from anywhere else, the
  header is not read and the connection's address is the client's.
- **What the BFF sends.** `Forwarded: for=192.0.2.1`, or `for="[2001:db8::17]"` for IPv6, which RFC
  7239 §6 says "MUST be quoted" in brackets [R15]. An IPv4-mapped IPv6 address is sent as IPv4. A
  `Forwarded` or `X-Forwarded-For` the browser sent is never forwarded. Fastify keeps `trustProxy:
  false`, so nothing else in the BFF reads a forwarding header.
- **Privacy.** RFC 7239 §8.3: the address "is considered to be privacy sensitive by many people" [R15].
  The BFF logs no client address on these routes; identity-control keeps only a keyed hash of it, for
  its window.

**Deployment edge.** No ingress fronts this BFF in any environment the platform deploys today: on the
development laptop the BFF is the edge, and the kernel's Caddy (`identity-kernel` `deploy/dev/Caddyfile`)
proxies Keycloak alone. A deployment that puts an ingress in front must make it replace every
forwarding header. Caddy does by default: "For these X-Forwarded-* headers, by default, the proxy will
ignore their values from incoming requests, to prevent spoofing", and "It sets or augments the
X-Forwarded-For header field" [R16]. It passes other headers through unmodified, so the ingress also
removes `Forwarded` and `X-Real-IP` (`header_up -Forwarded`, `header_up -X-Real-IP`), declares no
`trusted_proxies`, and the BFF's `IDENTITY_EXPERIENCE_TRUSTED_INGRESS` names the ingress's address.
That deployment is not in this repository, and is reported to the architecture repository.

**Forgery defences without a session.** §Cross-Site Request Forgery Defence protects cookie-borne
authority with `SameSite`, `Origin` and a session-bound token. These two routes carry no authority from
the browser: no cookie is read, no session exists, and the token or code in the body is the person's
own. What a forged request could do is send a code to an invited address with a token the forger
already holds, or spend a code's attempts. So the routes keep the checks that need no session, each
independent, in an `onRequest` hook that refuses with `403` before the body is parsed
(`bff/src/enrolment/routes.ts`):

1. **`Origin` equals the public origin.** OWASP: "If the Origin header is present, verify that its value
   matches the target origin" [R17]. A request without one is refused, as on the session routes.
2. **`Sec-Fetch-Site: same-origin`.** OWASP: "Treat cross-site as untrusted for state-changing actions",
   and, when the header is absent, "Fail-safe (recommended for sensitive endpoints): treat absence as
   unknown and block the request." [R17] A `same-site` request is refused too: no sibling site is
   trusted.
3. **`Content-Type: application/json`.** A cross-site page can post without a preflight only with
   "application/x-www-form-urlencoded, multipart/form-data or text/plain", and OWASP: "a simple
   mitigation is for the server or API to disallow these simple content types" [R17]. The BFF answers no
   preflight and sends no CORS header, so a JSON post from another origin never leaves the browser.

The session-bound CSRF token has no stand-in: OWASP's remedy for a request before sign-in is "creating
pre-sessions (sessions before a user is authenticated)" [R17], which protects a login form's session
from being fixed; these routes create no session to fix, and a pre-session would add a cookie and a row
for each anonymous visitor. `Cross-Origin-Resource-Policy: same-origin` also makes a cross-origin
`no-cors` read of the answer fail in the browser. The body is parsed in the routes' scope alone, as
JSON of at most 4 KiB, and must be exactly `{"token"}` (1 to 1024 characters) or
`{"enrolment_id","code"}` (a UUID, and 1 to 64 characters); anything else is `400`, which depends on the
body alone. The token, the code and the password are never logged: Fastify's request lines carry the
path, and the routes' own lines name a rule, never a value.

**One sentence per answer.** identity-control answers every token the same `202` and every refused
code the same `400` (`ADR-IAM-011 §5.1`, `§5.9`), so the BFF and the page keep that: the BFF passes on
no detail of identity-control's body, and the page chooses its sentence from the status alone
(`apps/account/src/domain/enrolment.ts`).

| Route | identity-control | The BFF answers | The page says |
| :-- | :-- | :-- | :-- |
| request | `202` `{enrolment_id}` | `202`, `no-store` | "If this invitation can still be used, a code is on its way to the address it was sent to. It is good for 10 minutes." |
| request | `429`, `Retry-After` | `429`, `Retry-After` | "Too many requests came from your network. Try again in N minutes." |
| request | `400` (a malformed body) | `400` | "This link cannot be used. Ask the person who invited you for a new one." |
| request | `401`, `403`, `5xx`, unreachable; or no workload, no client address | `503` | "Codes cannot be sent right now. Try again in a few minutes." |
| verify | `201` | `201`, `no-store` | The username, the temporary password and when it lapses, shown once |
| verify | `400` (every refused code) | `400` | "The code is wrong, has expired, or has been tried too often. Start again from the invitation link." |
| verify | `429`, `Retry-After` | `429`, `Retry-After` | "Too many codes were tried from your network. Try again in N minutes." |
| verify | `401`, `403`, `5xx`, unreachable | `503` | "Your account cannot be created right now. Your code stays good for its 10 minutes: try it again shortly." |

A `429` counts the client address, whatever the token, so it says nothing about any invitation
(`ADR-IAM-011 §5.8`). A `401` or `403` from identity-control is this deployment's misconfiguration (a
lapsed token, or a retired caller), never the person's, so it is the same `503` as an outage and is
logged. The verification's `503` sentence follows identity-control: "A `503` leaves the code good:
retry it."

**The temporary password, shown once.** `STD-IAM-001` 3.1.0 §3.1 names "the person who has just
proven the address they enrol with" as the exception's second recipient. Every condition holds here:

- The BFF holds the value in memory for the one response, with `Cache-Control: no-store`, and never logs
  it; the request asked for no cache either (`cache: 'no-store'`).
- The page holds it in its component's state alone, never in a query cache, browser storage or a URL.
  A reload, or leaving the page, discards it, and nothing can show it again. It offers Copy, and the
  value is selected whole on a click.
- **Then hosted login.** Continue to sign in is `/auth/login?return_to=/account/`: the kernel asks for
  the temporary password and forces its change, since it is temporary in the kernel (`ADR-IAM-010`).
  The page then says to open the invitation link again to accept, signed in.

**A strict content security policy.** The page is the account application's shell, so it carries
§Security Headers: `default-src 'none'`, `script-src 'self'`, no `unsafe-inline` and no `unsafe-eval`,
`connect-src 'self'` (the page calls only this origin), `form-action 'self'` and `frame-ancestors 'none'`.
The page needs nothing the policy refuses.

**When enrolment is not configured.** Without the enrolment workload, both routes answer `503` and log
why, and the page says codes cannot be sent. organization-experience's link then still opens the page.

### What the BFF Must Not Do

- It makes no authorization decision. Every command is reauthorized by the Identity
  Control API, per SAD-002 §8.
- It holds no business state and no domain logic.
- It never returns an access token, refresh token, ID token, client private key, or client
  secret to the browser, on any endpoint, including diagnostics.
- It never accepts a Tenant identifier from the browser as authority. A requested Tenant only
  selects what the sign-in asks for, and the session holds the one the ID token confirmed.

STD-IAM-001 §3.9 states the reason directly: UI authorization is defence in depth and
user-experience control only.

## Configuration

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `IDENTITY_EXPERIENCE_PUBLIC_ORIGIN` | none, required | Exact origin the browser uses; what the `Origin` check compares against |
| `IDENTITY_EXPERIENCE_WEB_ROOT` | none, required | The built Identity Admin Portal, served at `/` |
| `IDENTITY_EXPERIENCE_DEVELOPER_WEB_ROOT` | none | The built Developer Identity Console, served under `/developer/`. Unset, the console is not served and its paths are the Admin Portal's |
| `IDENTITY_EXPERIENCE_ACCOUNT_WEB_ROOT` | none | The built account security experience, served under `/account/`. Unset, it is not served and its paths are the Admin Portal's |
| `IDENTITY_EXPERIENCE_ISSUER` | none, required | Expected `iss`, validated on every ID token; `https` except on the developer's own machine |
| `IDENTITY_EXPERIENCE_KEYCLOAK_INTERNAL_URL` | the issuer | Where the token, key and logout endpoints are reached server to server |
| `IDENTITY_EXPERIENCE_CLIENT_ID` | none, required | This deployment's confidential client: one registration per deployment, and per developer device (1.21.0, below) |
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
| `IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_ID` | none | The enrolment workload's own client, one per deployment and per device; never the sign-in client. Set with the next, or neither: unset, the enrolment routes answer `503` (1.24.0) |
| `IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_KEY_FILE` | none | Its own private key as a PEM file (RSA ≥ 3072); never the sign-in key (1.24.0) |
| `IDENTITY_EXPERIENCE_TRUSTED_INGRESS` | none | The one ingress hop in front of the BFF, as an address or a CIDR range; on its connections the client address is its `X-Forwarded-For`. Unset: the connection's own address (1.24.0, §Enrolment From an Invitation) |

The migration step reads `IDENTITY_EXPERIENCE_MIGRATION_DATABASE_URL` (the owning role)
and `IDENTITY_EXPERIENCE_RUNTIME_ROLE` (the role granted DML); the server reads neither.

**One client registration per device (1.21.0).** `ADR-IAM-001` §5.12, amended 2026-10-20: "A
registration holds one active key, and a second only while a rotation overlaps. Concurrent instances
that do not share custody, such as two developer devices, are separate registrations, each with its
own single active key." `STD-GLB-009` rule 15 names the form, `identity-experience-bff-<device>`, and
says "Each device sets its own `*_CLIENT_ID` and key". So:

- On a laptop, `IDENTITY_EXPERIENCE_CLIENT_ID` comes from `.env`, and `scripts/dev-local.ps1` refuses to
  start without it. Until 1.21.0 the script set `identity-experience-bff` itself, so every device
  signed in as one client, and a second device's key went on that client beside the first.
- A second device registers its own client with its own key (`deploy/dev/README.md` §Keys). A second
  key on one registration is only for a rotation overlap.
- A production BFF is one deployment whose replicas load one key from custody, so it is one
  registration, as the ADR says.

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
  response and the built artifact. **As built (1.16.0):** `bff/test/containment.test.ts` drives
  every route on its success and refusal paths, more than thirty responses, through a refresh, a
  step-up, both back-channel logout answers and sign-out, and scans each one's headers and body for
  every token the stand-in kernel issued, any JSON Web Token at all, the client private key's members,
  the session key, the authorization code and the logout tokens. `scripts/check-dist.mjs` scans each
  built application for a JSON Web Token, a private key and a client secret, and fails the build.
- The token and logout requests carry a PS256 assertion signed by the registered key,
  each with a fresh `jti`, and no `client_secret` and no `Authorization: Basic` header,
  asserted against the identity provider mock.
- A client key file that is missing, unreadable, or below 3072 bits is a configuration
  error that names the problem and never the key.
- `localStorage` and `sessionStorage` hold no credential after a full sign-in flow.
- A session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefixed, and
  carries no encoded state.
- The session store holds neither a cookie value nor a token in plaintext.
- The purge deletes a session past its expiry that was never presented, and keeps a live one (1.23.0,
  `STD-IAM-001` 3.0.0 §3.4; `bff/test/auth.test.ts`, "session lifetime").

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
- **Tenant sign-in (1.15.0, `bff/test/tenant.test.ts`):**
  - a sign-in asks for exactly one form: `scnehaux-privileged organization:<tenant_id>` for the Tenant
    named, `scnehaux-provider` otherwise;
  - the session holds the Tenant the ID token confirmed;
  - a malformed or unbounded Tenant (`*`, two identifiers, uppercase) is refused before the kernel is
    asked;
  - a Tenant sign-in whose ID token names another Tenant, or none, is refused, and so is a provider
    sign-in whose ID token names one;
  - switching Tenant replaces the session;
  - a refresh that returns another Tenant ends the session;
  - with tenant sign-in off, any `tenant` is refused.

### Cross-Site Request Forgery

- A state-changing request with a foreign `Origin` is rejected.
- A state-changing request with no `Origin` is rejected.
- A state-changing request with a missing or wrong CSRF token is rejected.
- A cross-site form post carrying the session cookie is rejected.
- **Each defence refuses on its own (1.16.0, `bff/test/containment.test.ts`).** With the other two
  right, a foreign `Origin` is refused, a wrong token is refused, and a request without the cookie, as
  a browser sends a cross-site post under `SameSite=Lax`, finds no session. The control case with all
  three passes.
- **The browser enforces `SameSite=Lax` (1.20.0, `e2e/tests/same-site.spec.ts`, in CI).** Chromium,
  signed in to the BFF serving the built applications (`e2e/stack.ts`), holds the session cookie
  `HttpOnly`, `Secure`, `SameSite=Lax`, host-only on `/`. From a page on another site it sends no
  session cookie with a form post to `/auth/logout`, a credentialed `fetch()` post to the API, or a
  read inside an iframe, and the session outlives each. A same-site post carries it, and so does a
  cross-site top-level link, a safe navigation Lax allows, so the cookie is held and the site alone
  withholds it. What is asserted is the cookie header Chromium sent. MDN: Lax sends the cookie
  cross-site only for "a top-level navigation" that "uses a safe method", which "excludes POST" and
  excludes "requests made using the fetch() API" and "navigations inside <iframe> elements" [R13].

### Enrolment (1.24.0)

- **`bff/test/enrolment.test.ts`**, against stand-ins for the kernel's token endpoint and
  identity-control: the request and the verification are sent as the enrolment workload, with its
  client credentials assertion checked, `Forwarded: for=<address>` and no Idempotency-Key; the token is
  held, and a fresh one is presented after identity-control's `401`. No `Origin`, another `Origin`, a
  cross-site, same-site or absent `Sec-Fetch-Site`, and a form or text body are each refused `403` with
  nothing sent; a malformed body is `400` with nothing sent. A forwarding header the browser sent is
  ignored with nothing in front; behind the trusted ingress its one `X-Forwarded-For` value is the
  address, a connection from elsewhere is its own, and a missing or listed value is `503`. `429` keeps
  `Retry-After`; `401`, `403` and `5xx` are `503`; identity-control's detail is never passed on. The
  temporary password answers once with `no-store`, and no log line, at `trace`, holds the password, the
  code, the invitation token or the workload token. The configuration refuses one variable without the
  other, the sign-in client and the sign-in key, and anything but one address or range.
- **`apps/account`**: the fragment is taken on the enrolment page alone, cleared from the address bar
  and held in memory (`invitation-fragment.test.ts`); each status maps to one outcome
  (`domain/enrolment.test.ts`); the page asks for the link without a token, creates the account, refuses
  a code that is not 8 digits unsent, and says each table row's sentence (`EnrolmentPage.test.tsx`,
  with axe).
- **In Chromium** (`e2e/tests/enrolment.spec.ts`, against the real BFF and stand-ins): not signed in,
  at 320 CSS px, the link's token leaves the address bar and no request URL; the shell is `no-store`
  with the strict policy and `no-referrer`; the request carries `Origin`, `Sec-Fetch-Site: same-origin`,
  JSON and no `Referer`; a wrong code shows the one refusal; the right one shows the password once, and a
  reload shows nothing; nothing is in browser storage; axe finds nothing at each step, and a screenshot of
  each is kept. A cross-site page's `no-cors` post reads nothing, and a cross-site request is `403`. The
  page's refused and created states are in `accessibility.spec.ts` and `layout.spec.ts` in both themes at
  every width, with the short viewport.

### Revocation

- After Keycloak session removal, the next server-side refresh fails and the session
  is destroyed.
- An identity kernel outage during refresh answers 503 and keeps the session.
- Concurrent requests that find the token near expiry refresh once.
- Back-channel logout destroys the matching session and no other.
- A 401 from the Identity Control API destroys the session, unless it is a step-up challenge.
- A step-up challenge (`insufficient_user_authentication`) keeps the session, and its
  `WWW-Authenticate` reaches the browser.
- `/auth/login?max_age=N` sends `max_age`. A callback whose `auth_time` is older than `N` is
  refused. A malformed `max_age` is ignored.
- `/auth/login?kc_action=CONFIGURE_TOTP`, `?kc_action=webauthn-register` and
  `?kc_action=CONFIGURE_RECOVERY_AUTHN_CODES` send it, and any other action is not sent. The callback
  carries `kc_action_status` `success` or `cancelled` onto the return address, and nothing else.
- `/auth/login?acr_values=aal2` sends it. A callback whose ID token `acr` is below it is refused. An
  unknown level is ignored. A sign-in returning to the Admin Portal asks for `aal2` unless it names a
  level; one returning to the Developer Console or the account application asks for none.
- Measured time from Membership revocation to session destruction stays within the
  remaining access token lifetime of class `L0`. **The bound is asserted (1.16.0):**
  `bff/test/containment.test.ts` removes the kernel session at several points in a token's life, with
  no back-channel logout delivered, and an active tab's session ends no later than the expiry of the
  token it held at removal. An idle tab's first request after it is refused.
- **Measured against the stack (1.19.0)**, in organization-experience's `stack-proof` workflow, the
  stack-level proof of STD-GLB-009 §Stack-Level Proofs. That repository holds it because it consumes
  every stack the measurement needs: the kernel, identity-control and organization-control, wired as a
  development server is, this repository's BFF and applications at `identity_experience_ref`, and its
  own BFF. Two measurements, each from the authority's accepted instant to the instant the BFF answers
  a tab in use `401`, on the runner's one clock, read once a second by the page itself:
  - **A Membership revoked**, through Organization Control's API in a browser, ends a Tenant session.
    This BFF holds no Tenant session (§Context Switch: tenant sign-in is off), so the session measured
    is the pattern's, served by organization-experience, whose pattern files are this repository's byte
    for byte; the evidence records whether they equal this repository's at the ref checked out. No
    kernel session ends (`ADR-IAM-006 §5.5`), so no back-channel logout is sent: the refresh path alone
    bounds it, and a lost notification cannot extend it because there is none to lose. The bound is
    SAD-001 §7.7's for that session: the propagation from acceptance to the kernel's removal of the
    member, plus the remaining lifetime of the token the session held then. The proof fails above it,
    and above the `L0` revocation target of 300 seconds. No request is served after acceptance, an
    idle tab's first request is refused, and one after its token expired finds the session gone.
  - **A kernel session removed** ends this BFF's session: a person signed in on two devices ends the
    first from the second in the account application. Where the kernel holds a back-channel logout URL
    for this BFF's client, the logout token ends it at once, and the proof fails if it takes longer than
    10 seconds after the kernel's removal. Where it holds none, the next refresh is refused, within the
    remaining lifetime of the token held, and no refresh succeeds after the removal. In the stack the
    kernel reaches this BFF on its network's gateway, as it reaches a deployed one, so the URL is
    registered wherever identity-control takes it.
  Both go to the `stack-evidence` artifact as JSON, with the bound beside the measurement, and to the
  job summary. The figures are in the ROADMAP's Week 2 exit.
- **Two early runs in which the kernel granted a removed session's refresh (1.20.0).** In two runs of
  2026-10-08 a refresh of a kernel session removed through the Admin API was granted: the session's
  token was renewed after the removal, and the kernel's complete log holds no `REFRESH_TOKEN_ERROR`,
  which it writes for every refusal. This BFF keeps a session only on the kernel's grant, so its part
  held; why the kernel granted it is identity-kernel's to establish. Where no back-channel logout URL
  is registered, the refresh path's bound for a removed kernel session is therefore measured, not
  guaranteed, until it is. The runs and their evidence are in the ROADMAP's Week 2 exit.

### Session-Store Outage

**As built (1.17.0), `bff/test/store-outage.test.ts`**, with the store cut off by a TCP link the test
controls between the BFF and PostgreSQL:

- An API call, a state-changing one included, answers `503 dependency-unavailable`, reaches nothing
  upstream and keeps the cookie; the same call succeeds once the store answers.
- `/auth/session` answers `503`, and the session is still signed in afterwards.
- `/auth/login` and a callback land on `?sign-in=unavailable`, and set no session cookie.
- A sign-out answers `503`, keeps the cookie, and succeeds when repeated.
- A back-channel logout answers `400`, and the session outlives it.
- Served under another session key, a session answers `401` and its cookie is cleared, reads as
  `{"authenticated": false}`, answers a sign-out `401`, and its holder signs in again; a sign-in
  started under the old key lands on `?sign-in=failed`.

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

## Backups (1.21.0, session store 1.23.0)

`STD-GLB-009` rule 9 applies to "A stack that owns a database" on a development server. This
repository runs no stack there (`deploy/dev/README.md` §What runs). The laptop's session store, the
`identity_experience_dev` schema, holds only sessions: it is disposable, and dropping it signs the
laptop's browser out (`deploy/dev/README.md` §Backups).

**The session store is excluded from backup and restore (1.23.0, `STD-IAM-001` 3.0.0 §3.4).** The
standard: "The session store is excluded from backup, snapshot and replication that outlives it, so no
copy of a session exists past its absolute lifetime. Restoring the platform brings it up with an empty
session store, and every person signs in again". It is also "not an authoritative data store and
declares no RPO or restore test" (`STD-GLB-002` §Durability & Recovery). This closes the retention
declaration this section owed before production: it is the record's own expiry (§Data Model). This
repository has no backup script and no restore drill: none runs on the server (`deploy/dev/README.md`
§What runs), so no session store is included in one. A production deployment's backup job excludes the
BFF's database (`sessions`, `login_states`) and its restore leaves them empty; that job belongs to the
platform's deployment, not to this repository.

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
failure, client key rotation, and suspected session fixation. They are written (1.16.0), in
`docs/runbooks/`, from the code as built.

## Traceability

| Relationship | Target |
| :-- | :-- |
| Parent system | SAD-002 — Scnehaux Identity Experience |
| Realizes capability | PAD-PLT-001 — Identity & Access Platform |
| Governed by | ADR-IAM-001 — Adopt Keycloak Identity Kernel |
| Conforms to | STD-IAM-001 §3.9 — no browser-held refresh tokens; BFF session control for privileged experiences |
| Conforms to | STD-IAM-001 §3.2 — Authorization Code with PKCE `S256`; confidential client authentication by `private_key_jwt` |
| Governed by | ADR-IAM-001 §5.12 — confidential clients authenticate with registered keys; one registration per developer device (1.21.0) |
| Conforms to | STD-GLB-009 rule 15 — each device sets its own client id and key (1.21.0); rule 9 — no stack here owns a database (1.21.0) |
| Governed by | ADR-IAM-011 §5.1 to §5.9, as amended twice on 2026-10-21 — an invitee without an account enrols at redemption: the enrolment page at `/account/enrol` and its anonymous routes, built (1.24.0) |
| Conforms to | STD-IAM-001 3.1.0 §3.1 — the temporary password shown once to the enrolling person, `no-store`, never logged or stored (1.24.0) |
| Conforms to | STD-GLB-009 rule 15 — the enrolment workload is its own client and key per device (1.24.0) |
| Depends on | `identity-control` — `POST /v1/enrolments` and `:verify`, and the enrolment caller record (`TDD-identity-control-001` 1.27.0, `api/openapi.yaml` 1.2.0) (1.24.0) |
| Conforms to | STD-IAM-001 3.0.0 §3.4 — the session record is deleted by an expiry on the record at the earliest of absolute timeout, idle timeout, logout and revocation; the store is excluded from backup and restore and is not an authority (1.23.0) |
| Conforms to | ADR-GLB-010 §5.1 — the applications' hand-written Identity Control client is contract-tested against its published OpenAPI document (`TDD-identity-experience-003` 1.32.0) |
| Conforms to | STD-IAM-002 §3.1, §3.3 — `privileged` audience class and lifetime class `L0` |
| Governed by | ADR-IAM-006 §5.2, ADR-IAM-008 — the Tenant chosen per sign-in, one form per sign-in, checked on the callback (1.15.0) |
| Conforms to | STD-GLB-001 — RFC 7807 problem details |
| Conforms to | STD-GLB-005 §Retry and Exponential Backoff Policy — a store outage answers 503, which a caller may retry; a refusal answers 4xx, which it may not (1.17.0) |
| Conforms to | STD-GLB-009 §Stack-Level Proofs — the revocation to session destruction measured in organization-experience's `stack-proof` workflow (1.19.0) |
| Enterprise constraint | EAD-006 — default deny; a valid artifact is not an authorization decision |
| Depends on | `identity-kernel` — hosted login and realm configuration; `compat/back_channel_logout_test.go` proves the pinned kernel posts a logout token on an Admin API removal and none to a front-channel client |
| Depends on | `identity-control` — the client's `backchannel_logout_uri` and front-channel logout held off (`TDD-identity-control-003` 1.37.0) |
| Governed by | ADR-IAM-009 — logout reaches a relying party by the back channel; no front-channel logout (1.18.0) |
| Conforms to | STD-IAM-001 2.7.0 §3.4 — back-channel logout for a reachable server-side relying party |
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

## References

| Ref | Source |
| :-- | :-- |
| R1 | IETF RFC 9470, *OAuth 2.0 Step Up Authentication Challenge Protocol*, §4, <https://www.rfc-editor.org/rfc/rfc9470#section-4>: "A client receiving a challenge from the resource server carrying the insufficient_user_authentication error code SHOULD parse the WWW-Authenticate header for acr_values and max_age and use them, if present, in constructing an authorization request." |
| R2 | OpenID Foundation, *OpenID Connect Core 1.0*, §3.1.2.1, <https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest>, accessed 2026-10-03: max_age "Specifies the allowable elapsed time in seconds since the last time the End-User was actively authenticated by the OP. If the elapsed time is greater than this value, the OP MUST attempt to actively re-authenticate the End-User … When max_age is used, the ID Token returned MUST include an auth_time Claim Value." |
| R3 | Sam Newman, *Backends For Frontends*, <https://samnewman.io/patterns/architectural/bff/>, accessed 2026-10-03: "'one experience, one BFF'. So if the iOS and Android experiences are very similar, then it is easier to justify having a single BFF"; "BFFs work best when aligned around team boundaries, so team structure should drive how many BFFs you have." |
| R4 | IETF, *OAuth 2.0 for Browser-Based Applications*, draft-ietf-oauth-browser-based-apps-27, §6.1, <https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps>: "The BFF runs as a server-side component, but it is a component of the frontend application" (§6.1.3); "The BFF relies on browser cookies to keep track of the user's session, which is used to access the user's tokens" (§6.1.2.3); "This architecture is strongly recommended for business applications, sensitive applications, and applications that handle personal data" (§6.1.4.3). |
| R5 | Duende Software, *BFF: Multiple Frontends*, <https://docs.duendesoftware.com/bff/fundamentals/multi-frontend/>, accessed 2026-10-03: frontends are "identified either via path based routing and/or host selection"; each can "Define its own Cookie settings"; "having a dedicated backend service for each frontend introduces quite a lot of operational overhead." |
| R6 | Keycloak, *Server Administration Guide*, Application Initiated Actions, <https://www.keycloak.org/docs/latest/server_admin/index.html>, accessed 2026-10-03: AIA "is triggered by adding the kc_action parameter to the OIDC login URL"; a cancelled action returns "kc_action_status=cancelled"; "The kc_action and kc_action_status parameters are a Keycloak proprietary mechanism unsupported by the OIDC specification." |
| R7 | Keycloak 26.7.5, *Server Administration Guide*, Registering WebAuthn credentials using AIA, source `docs/documentation/server_admin/topics/authentication/webauthn.adoc` at tag 26.7.5, accessed 2026-10-03: "The actions *Webauthn Register* (`kc_action=webauthn-register`) and *Webauthn Register Passwordless* (`kc_action=webauthn-register-passwordless`) are available for the applications if enabled in the Required actions tab." identity-kernel's compat suite proves `webauthn-register` on the pinned kernel (TDD-identity-kernel-001 1.11.0). |
| R8 | Auth0, *Custom development* for Organizations, <https://auth0.com/docs/manage-users/organizations/custom-development>, accessed 2026-10-07: "on callback, ensure that the organization returned in the ID token is the same one that was sent in the /authorize request by validating the org_id claim in the same way that other claims like exp and nonce are validated." |
| R9 | IETF RFC 9110, *HTTP Semantics*, §15.6.4 and §10.2.3, <https://www.rfc-editor.org/rfc/rfc9110#section-15.6.4>, accessed 2026-10-08: "The 503 (Service Unavailable) status code indicates that the server is currently unable to handle the request due to a temporary overload or scheduled maintenance, which will likely be alleviated after some delay. The server MAY send a Retry-After header field (Section 10.2.3) to suggest an appropriate amount of time for the client to wait before retrying the request." §10.2.3: "When sent with a 503 (Service Unavailable) response, Retry-After indicates how long the service is expected to be unavailable to the client." §15.6.1: "The 500 (Internal Server Error) status code indicates that the server encountered an unexpected condition that prevented it from fulfilling the request." |
| R10 | IETF RFC 9110, *HTTP Semantics*, §15.5.2, <https://www.rfc-editor.org/rfc/rfc9110#section-15.5.2>, accessed 2026-10-08: "The 401 (Unauthorized) status code indicates that the request has not been applied because it lacks valid authentication credentials for the target resource." |
| R11 | PostgreSQL 17 Documentation, *Appendix A. PostgreSQL Error Codes*, <https://www.postgresql.org/docs/17/errcodes-appendix.html>, accessed 2026-10-08: "According to the standard, the first two characters of an error code denote a class of errors, while the last three characters indicate a specific condition within that class. Thus, an application that does not recognize the specific error code might still be able to infer what to do from the error class." Classes "08 — Connection Exception", "53 — Insufficient Resources", "57 — Operator Intervention", "58 — System Error (errors external to PostgreSQL itself)". |
| R12 | OpenID Foundation, *OpenID Connect Back-Channel Logout 1.0*, §2.8, <https://openid.net/specs/openid-connect-backchannel-1_0.html>, accessed 2026-10-08: "If the logout request was invalid or the logout failed, the RP MUST respond with HTTP 400 Bad Request." |
| R14 | IETF RFC 3986, *Uniform Resource Identifier (URI): Generic Syntax*, §3.5, <https://www.rfc-editor.org/rfc/rfc3986#section-3.5>, accessed 2026-10-21: "the fragment identifier is separated from the rest of the URI prior to a dereference". |
| R15 | IETF RFC 7239, *Forwarded HTTP Extension*, <https://www.rfc-editor.org/rfc/rfc7239>, accessed 2026-10-21. §5.2: "The "for" parameter is used to disclose information about the client that initiated the request". §6: "It is important to note that an IPv6 address and any nodename with node-port specified MUST be quoted", with `nodename = IPv4address / "[" IPv6address "]"`. §8.1: "The "Forwarded" HTTP header field cannot be relied upon to be correct, as it may be modified, whether mistakenly or for malicious reasons, by every node on the way to the server". §8.3: "The client's IP address, that may be forwarded in the "for" parameter of this header field, is considered to be privacy sensitive by many people". |
| R16 | Caddy, *reverse_proxy*, Defaults and `trusted_proxies`, <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy>, accessed 2026-10-21: "By default, Caddy passes through incoming headers—including Host—to the backend without modifications, with three exceptions: It sets or augments the X-Forwarded-For header field."; "For these X-Forwarded-* headers, by default, the proxy will ignore their values from incoming requests, to prevent spoofing."; `trusted_proxies`: "a list of IP ranges (CIDRs) from which incoming requests are trusted to have sent good values for these headers". |
| R17 | OWASP, *Cross-Site Request Forgery Prevention Cheat Sheet*, <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>, accessed 2026-10-21: "If the Origin header is present, verify that its value matches the target origin."; Fetch Metadata: "Treat cross-site as untrusted for state-changing actions."; "Fail-safe (recommended for sensitive endpoints): treat absence as unknown and block the request."; "For a request to be deemed simple, it must have one of the following content types - application/x-www-form-urlencoded, multipart/form-data or text/plain."; "Therefore a simple mitigation is for the server or API to disallow these simple content types."; "Login CSRF can be mitigated by creating pre-sessions (sessions before a user is authenticated)". |
| R13 | MDN Web Docs, *Set-Cookie*, `SameSite=Lax`, <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie>, accessed 2026-10-09: "Send the cookie only for requests originating from the same site that set the cookie, and for cross-site requests that meet both of the following criteria: The request is a top-level navigation … This would exclude, for example, requests made using the fetch() API, or requests for subresources from <img> or <script> elements, or navigations inside <iframe> elements … The request uses a safe method: in particular, this excludes POST, PUT, and DELETE." |
