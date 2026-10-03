# Identity Experience

TypeScript applications and their backend-for-frontend for Scnehaux identity
administration. It realizes **SAD-002 Scnehaux Identity Experience**, except for the
hosted login pages.

## The split you need to know first

SAD-002 spans two repositories, because one of its containers is rendered by Keycloak
and the rest are not.

| Container                                    | Repository                           |
| :------------------------------------------- | :----------------------------------- |
| Hosted login, MFA enrollment, recovery pages | `identity-kernel` — a Keycloak theme |
| Account security experience                  | **here**                             |
| Identity admin portal                        | **here**                             |
| Developer identity console                   | **here**                             |
| Identity Experience BFF                      | **here**                             |

The login pages are Keycloak-rendered through supported theme extension points, so they
are versioned and upgrade-tested alongside the release whose template contract they
depend on. Putting them here would decouple them from that contract.

## The BFF is not optional

STD-IAM-001 §3.9 prohibits browser applications from persisting refresh tokens or
equivalent long-lived bearer secrets, and directs privileged administrative experiences
to server-managed session control.

So the browser holds an opaque `__Host-` session cookie and never holds a token. Every
token lives server-side in the BFF, which is a confidential OAuth client. It authenticates to
Keycloak with its own private key (`private_key_jwt`), which the browser never sees. The client
has no secret, on the development server as everywhere else.

```text
Browser  ──opaque session cookie──►  BFF  ──access token──►  Identity Control API
                                      │
                                      └──code + PKCE──►  Keycloak
```

The trade is stated rather than implied: this pattern removes token exfiltration and
adds cross-site request forgery. That is defensible because forgery is bounded to an
open session, detectable at the server, and has three independent deterministic
defences, while exfiltration is unbounded once it happens.

`TDD-identity-experience-001` specifies the pattern in full, and it is the normative
reference for `organization-experience` as well.

## What this repository owns

- Account security: sessions, devices, authenticators, consent.
- Identity administration and investigation surfaces.
- Application and client onboarding for developers.
- The BFF: session, refresh, step-up, logout, and the API proxy.

## What it does not own

It makes no authorization decision. Every command is reauthorized by the Identity
Control API, per SAD-002 §8. UI authorization is defence in depth and user-experience
control only — STD-IAM-001 §3.9 says so directly.

It holds no business state, runs no domain logic, and never returns a token to the
browser on any endpoint, including diagnostics.

## Governance lineage

```text
PAD-PLT-001                  Identity & Access Platform
    ↓
SAD-002                      Scnehaux Identity Experience
    ↓
TDD-identity-experience-*    Technical designs   (docs/designs)
    ↓
Source code
```

## Repository map

| Repository                | Role                                                                          |
| :------------------------ | :---------------------------------------------------------------------------- |
| `identity-kernel`         | Keycloak extensions, realm configuration, **hosted login theme**, image build |
| `identity-control`        | Identity Control Service — this application's API                             |
| `organization-control`    | Organization, Tenant, Workspace, Membership authority                         |
| `foundation-platform`     | Shared Go substrate, not consumed here                                        |
| **`identity-experience`** | **This repository**                                                           |
| `organization-experience` | Organization administration UI, conforms to this BFF pattern                  |

## Layout

| Path                 | Contents                                                                                                                                             |
| :------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/`        | Identity admin portal: Vite, React 19, TanStack Router and Query, rendered in the browser                                                            |
| `apps/account/`      | Account security experience, served under `/account/`: a person's own sessions and authenticators                                                    |
| `apps/developer/`    | Developer identity console, served under `/developer/`: the registrations a person owns, their keys and lifecycle                                    |
| `packages/app-core/` | `@identity-experience/app-core`: API access, session, query client, preferences, the shared frame and the registration domain every application uses |
| `packages/ui/`       | `@identity-experience/ui`, the temporary stand-in for the UI Platform's packages (see its README)                                                    |
| `bff/`               | Fastify on Node.js: session, refresh, step-up, logout, API proxy, and serving the built applications                                                 |
| `docs/designs/`      | Technical Design Documents                                                                                                                           |

Inside an application, `src/` follows the four layers of STD-GLB-FE-001 §3, and
`.dependency-cruiser.cjs` enforces them. `domain/` is pure TypeScript. `core/` holds the
application's message catalogue. `features/` has one folder per surface, and a feature never
imports another. `routes/` are thin files that hand a path to a feature. What every application
shares, API access, the session, the query client, preferences, the frame and the shared domain,
is in `packages/app-core`, whose own `domain/` is pure too; each application spreads its strings
into its catalogue.

## Running it

Node 24 and pnpm 10:

```sh
pnpm install
pnpm dev:admin        # Vite on :5173, forwarding /api and /auth to the BFF on :8090
pnpm dev:developer    # Vite on :5174, at /developer/, forwarding the same
pnpm test && pnpm lint && pnpm build
```

The BFF serves `apps/admin/dist` at `/` and `apps/developer/dist` at `/developer/` in every
environment that matters, so the browser always talks to one origin.
`IDENTITY_EXPERIENCE_WEB_ROOT` and `IDENTITY_EXPERIENCE_DEVELOPER_WEB_ROOT` name the directories
(the second is optional), and
`IDENTITY_EXPERIENCE_PUBLIC_ORIGIN` the exact origin. The rest of its configuration is the table in
TDD-001 §Configuration.

### Signing in against the development kernel

Keycloak runs on the development server, and nothing here needs Docker. The BFF authenticates with
its own key, so the first step is on this machine:

```powershell
node scripts/new-client-key.mjs     # keys/identity-experience-bff.pem stays here; send the .jwk.json
```

Send `keys/identity-experience-bff.jwk.json`, the public half, to whoever operates the server. It is
not secret. They install it once, depending on whether the client exists yet:

```sh
# the client does not exist yet
deploy/dev/create-bff-client.sh /path/to/identity-control/deploy/dev/.env /path/to/identity-experience-bff.jwk.json
# the client exists, for example created with a secret before keys: give it the key instead
/path/to/identity-kernel/deploy/dev/set-client-key.sh scnehaux identity-experience-bff /path/to/identity-experience-bff.jwk.json
```

`set-client-key.sh` also regenerates the client's old secret without printing it, so a secret that
was ever exposed stops working. Then, on this machine, copy `.env.example` to `.env` (delete any
`IDENTITY_EXPERIENCE_CLIENT_SECRET` line an older `.env` has), and:

```powershell
./scripts/dev-local.ps1
```

That builds the application and the BFF, creates the `identity_experience_dev` schema in the local
PostgreSQL, applies the migrations, and serves `http://127.0.0.1:8090`. Not `localhost:8080`: the dev
tunnel forwards the server's port 8080 and rewrites a redirect to `localhost:8080` into its own URL,
so Keycloak's return never reached the laptop. Sign in as a Principal the
kernel knows, such as the bootstrap operator. `/api/*` answers 503 until identity-control listens
on `IDENTITY_CONTROL_BASE_URL`.

Keycloak cannot reach this machine, so no back-channel logout is registered for this client: a
session removed in the kernel ends the BFF session at its next refresh, within four minutes.

### Migrations

The session store is PostgreSQL. Its migrations are a separate step, run as the owning role:

```sh
IDENTITY_EXPERIENCE_MIGRATION_DATABASE_URL=postgres://owner@host/db \
IDENTITY_EXPERIENCE_RUNTIME_ROLE=identity_experience_bff \
pnpm --filter @identity-experience/bff migrate
```

The BFF's tests run against PostgreSQL too, in a throwaway schema they drop afterwards.
`IDENTITY_EXPERIENCE_TEST_DATABASE_URL` names a database they may create schemas in; without it
the session tests fail rather than skip.

## Designs

| TDD                           | Subject                                                      | Status   |
| :---------------------------- | :----------------------------------------------------------- | :------- |
| `TDD-identity-experience-001` | Backend-for-frontend session and browser security            | approved |
| `TDD-identity-experience-002` | Account security: sessions, devices, authenticators, consent | approved |
| `TDD-identity-experience-003` | Identity administration and investigation                    | approved |
| `TDD-identity-experience-004` | Developer identity console                                   | approved |

## Standalone operation

This repository requires no Scnehaux platform other than the five it shares this
foundation with. It has one build-time dependency, `scnehaux-ui-platform`, which
produces no runtime edge, and no dependency on Notification, Audit, Software Catalog,
or Subscription & Entitlement.
