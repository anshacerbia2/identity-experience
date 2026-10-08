# Development client registration

The Identity Experience BFF runs on a developer's machine and signs in against the development kernel
on the server as its own confidential client, `identity-experience-bff`. Nothing of this repository
runs on the server. This page states who makes that client, with what, from which keys, and how the
laptop runs against it.

It follows the skeleton of STD-GLB-009 §Development Server Deployment for a laptop-run application.
The procedure across the server's stacks is the architecture repository's development server runbook
(`docs/runbooks/dev-server.md`); this client is its step 4, and its adoption is in step 6.

## What runs

On the server, nothing: no compose stack, no container. The server holds this application's client,
in the kernel's `scnehaux` realm, and its registration, in identity-control.

On the laptop, `scripts/dev-local.ps1` builds the applications and the BFF and serves them on
`http://127.0.0.1:8090`: the admin application at `/`, the Developer Console at `/developer/`, and the
account security experience at `/account/`. The BFF keeps its sessions in a local PostgreSQL.

The client:

| Property              | Value                                                                                                                                                          |
| :-------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client                | `identity-experience-bff`                                                                                                                                      |
| Registered through    | identity-control's `POST /v1/registrations`, or adopted with `POST /v1/registrations:adopt`                                                                    |
| Profile               | `confidential`: Authorization Code with PKCE `S256`, nothing else                                                                                              |
| Audience class        | `privileged`, in the `provider-scope` form: the kernel's `scnehaux-provider` scope. Never `internal`                                                           |
| Client authentication | `private_key_jwt`, PS256. The client has no secret (ADR-IAM-001 §5.12)                                                                                         |
| Audience              | `identity-control-api`, the Identity Control API's keyless resource (STD-IAM-002 §3.1)                                                                         |
| Redirect URI          | `http://127.0.0.1:8090/auth/callback`, exactly                                                                                                                 |
| Back-channel logout   | none: Keycloak cannot reach a developer's machine, so a session removed in the kernel ends at the BFF's next refresh, within four minutes (`ADR-IAM-009 §5.3`) |
| Front-channel logout  | off, written by identity-control on every client it creates (`ADR-IAM-009 §5.2`)                                                                               |

`create-bff-client.sh` in this directory is the operator's script that made this client before
identity-control could register a confidential client. It is superseded (its header says so) and is
kept for the servers whose client it made, which are adopted instead.

## Before you start

On the server, already running:

- **identity-kernel**, with its realm applied, so the `scnehaux-provider` scope exists.
- **identity-control**, after its ceremony, so a provider can register or adopt the client. Its
  adoption script, `scripts/dev-adopt-bff.ps1`, needs PowerShell 7 (`pwsh`) where it runs.

On the laptop:

- Node 24 and pnpm 10.
- PowerShell 7 (`pwsh`), for `scripts/dev-local.ps1`.
- A local PostgreSQL the session store may create its schema in.
- The devtunnel CLI, logged in as the tunnel's owner, only to call the server's identity-control
  through an owner-only port ([Wiring to other services](#wiring-to-other-services)).

From the server's operator: the client, registered or adopted with this laptop's public key.

## First start

1. **On the laptop, make the key pair.** The private key stays here; only the public JWK leaves:

   ```powershell
   node scripts/new-client-key.mjs     # keys/identity-experience-bff.pem stays here; send the .jwk.json
   ```

   Send `keys/identity-experience-bff.jwk.json` to whoever operates the server. It is not secret.

2. **On the server, the operator registers the client, or adopts it.** Which one depends on whether the
   client exists in the kernel:
   - **It does not exist (a new server).** Register it through identity-control, with a provider-scope
     token (identity-control's `scripts/dev-token.ps1`), an `Idempotency-Key` and an ASCII
     `X-Administrative-Reason`:

     ```text
     POST /v1/registrations

     {"client_key":"identity-experience-bff","profile":"confidential","audience_class":"privileged",
      "privileged_form":"provider-scope","application_ref":"identity-experience",
      "redirect_uris":["http://127.0.0.1:8090/auth/callback"],"audience":["identity-control-api"],
      "public_key":<keys/identity-experience-bff.jwk.json>}
     ```

     The fields are those identity-control's `POST /v1/registrations` reads
     (`internal/httpapi/registrations.go`, `TDD-identity-control-003`). The body names no
     `backchannel_logout_uri`, because the kernel cannot reach the laptop. A BFF deployed where the
     kernel reaches it adds `"backchannel_logout_uri":"https://<its host>/auth/back-channel-logout"`,
     and identity-control writes it on the client with front-channel logout off
     (`TDD-identity-control-003` 1.37.0); identity-control's `deploy-dev` proves that path from zero.

   - **It exists, made by `create-bff-client.sh`.** Adopt it with identity-control's
     `scripts/dev-adopt-bff.ps1`, a plan first, then with `-Apply` (identity-control
     `deploy/dev/README.md` §Adopting the BFF):

     ```powershell
     pwsh ./scripts/dev-adopt-bff.ps1 -BffJwkFile ./identity-experience-bff.jwk.json          # the plan
     pwsh ./scripts/dev-adopt-bff.ps1 -BffJwkFile ./identity-experience-bff.jwk.json -Apply   # adopt
     ```

     It declares the client as above with every key the BFF holds, and converges `token_format` and
     `audience_scope`. `-BffJwkFile` takes one or two JWK files, `-BffJwkFile a.jwk.json,b.jwk.json`
     (identity-control's script after identity-control#102). The keys are compared as a set. After
     adoption the first is `active` and the second `retiring`.

   - **It exists, made with a secret before keys.** Give it the key first, with the kernel's tool, then
     adopt it as above:

     ```sh
     /path/to/identity-kernel/deploy/dev/set-client-key.sh scnehaux identity-experience-bff /path/to/identity-experience-bff.jwk.json
     ```

     `set-client-key.sh` also regenerates the client's old secret without printing it, so a secret that
     was ever exposed stops working.

3. **On the laptop, configure and run.** Copy `.env.example` to `.env` beside the repository root and
   fill it in (delete any `IDENTITY_EXPERIENCE_CLIENT_SECRET` line an older `.env` has):

   | Variable                               | Value                                                                         |
   | :------------------------------------- | :---------------------------------------------------------------------------- |
   | `IDENTITY_EXPERIENCE_ISSUER`           | the kernel's public issuer, exactly as its discovery document states it       |
   | `IDENTITY_EXPERIENCE_DEV_DATABASE_URL` | a database the session store may create its schema in; required               |
   | `IDENTITY_CONTROL_BASE_URL`            | where identity-control listens, for `/api/*`; default `http://127.0.0.1:8097` |
   | `IDENTITY_EXPERIENCE_CLIENT_KEY_FILE`  | the private key; empty for `keys/identity-experience-bff.pem`                 |
   | `IDENTITY_EXPERIENCE_SESSION_KEY`      | empty: the script generates it on its first run and writes it to `.env`       |

   Then:

   ```powershell
   ./scripts/dev-local.ps1
   ```

   That builds the applications and the BFF, creates the `identity_experience_dev` schema in the local
   PostgreSQL, applies the migrations, and serves `http://127.0.0.1:8090`. It is ready when it prints
   `dev-local: open http://127.0.0.1:8090 and sign in.` Sign in as a Principal the kernel knows, such as
   the bootstrap operator.

## Updating

On the laptop, `git pull`, then `./scripts/dev-local.ps1`. It rebuilds and applies any new session
store migration before it serves. `-NoBuild` skips the build when only the server needs restarting.

On the server, nothing is updated for this application. A change to the client, such as a new redirect
URI, is a change to its registration in identity-control, never a change in the Keycloak console.

## One-off tasks

None on the server. On the laptop, `dev-local.ps1` runs the session store's migrations every time. To
run them alone, as the owning role:

```sh
IDENTITY_EXPERIENCE_MIGRATION_DATABASE_URL=postgres://owner@host/db \
IDENTITY_EXPERIENCE_RUNTIME_ROLE=identity_experience_bff \
pnpm --filter @identity-experience/bff migrate
```

## Wiring to other services

The BFF joins no Docker network. It reaches the server over HTTPS and the dev tunnel:

- **The kernel**, at `IDENTITY_EXPERIENCE_ISSUER`, through the tunnel's anonymous port 8080. The
  browser is sent there to sign in and returns to `http://127.0.0.1:8090/auth/callback`.
- **identity-control**, at `IDENTITY_CONTROL_BASE_URL`, for every `/api/*` call. Sign-in works without
  it; the proxied calls answer 503 until it listens there. To use the server's identity-control, add
  its port 8082 to the tunnel, owner-only, run `devtunnel connect <tunnel>` on the laptop, and set
  `IDENTITY_CONTROL_BASE_URL=http://127.0.0.1:8082` (identity-control `deploy/dev/README.md` §Calling
  the API).

The organization-experience BFF, on `127.0.0.1:8091`, sets the same session cookie,
`__Host-ident_session`, because the cookie is part of the pattern it conforms to. A browser scopes
cookies by host, not by port, so signing in to one BFF signs the browser out of the other. Use one at a
time, or two browser profiles.

## Keys

| Key                                     | Made by                                          | Lives                                                        |
| :-------------------------------------- | :----------------------------------------------- | :----------------------------------------------------------- |
| `keys/identity-experience-bff.pem`      | `node scripts/new-client-key.mjs`, on the laptop | the laptop only, mode 0600, gitignored. It never leaves      |
| `keys/identity-experience-bff.jwk.json` | the same script, beside it                       | sent to the server's operator, who installs it on the client |

The key is 3072-bit RSA, and its `kid` is its RFC 7638 thumbprint. The script never overwrites a key.

**Several devices.** Each laptop makes its own key pair and sends its public JWK; no private key is
copied between machines. How the server takes them depends on whether the client is adopted yet:

- **Not yet adopted.** The kernel's `set-client-key.sh` sets a client's whole key set in one call, so
  every device's JWK goes in the same call. A key left out stops working. It takes one or two JWKs:

  ```sh
  ./set-client-key.sh scnehaux identity-experience-bff laptop-a.jwk.json laptop-b.jwk.json
  ```

  Adopting that client declares both keys: `dev-adopt-bff.ps1 -BffJwkFile laptop-a.jwk.json,laptop-b.jwk.json`.
  The first becomes `active` and the second `retiring`. The retiring key is removed when
  identity-control's `IDENTITY_CLIENT_KEY_ROTATION_OVERLAP` ends (168h by default), so the two devices
  cannot both keep signing as the BFF after adoption. List first the key that must keep working.

- **Adopted or registered.** The client's keys belong to its registration. `dev-adopt-bff.ps1` declares
  every key it is given, one or two, and a key the registration does not declare is a difference
  identity-control reports, so the operator adopts with every key the client holds. A further key goes through
  identity-control, `POST /v1/registrations/{registration_id}/keys`, never through `set-client-key.sh`.

**Rotating.** A new key is a rotation, never an overwrite. Make it under a new name, send its public
half, and point `IDENTITY_EXPERIENCE_CLIENT_KEY_FILE` at the new private key once the server accepts it:

```powershell
node scripts/new-client-key.mjs identity-experience-bff-next
```

Before adoption, the operator installs both public keys with `set-client-key.sh`, then the new one
alone. After it, the new key goes through `POST /v1/registrations/{registration_id}/keys` with
`{"public_key":<keys/identity-experience-bff-next.jwk.json>}`.

## Backups

Nothing here needs a backup. The client lives in the kernel's database and its registration in
identity-control's, and each stack backs up its own. The laptop's session store, the
`identity_experience_dev` schema, is disposable: drop it and `dev-local.ps1` makes it again, and you
sign in again. The private key is not backed up either: a lost key is replaced by a new one, installed
as a rotation.

## Never do

- **Copy `keys/identity-experience-bff.pem` anywhere, or commit `.env` or `keys/`.** Only the public JWK
  leaves the laptop.
- **Run `create-bff-client.sh` to make or change the client.** It is superseded. A new server registers
  the client through identity-control, and the script refuses a client that exists.
- **Run identity-control's `create-kernel-clients.sh` or `dev-keycloak.ps1` for this client.** They make
  other clients.
- **Adopt the client as `internal`.** Converging `audience_scope` would replace `scnehaux-provider`, and
  every provider route would refuse the BFF's next token. The plan now refuses that declaration.
- **Set identity-control's `IDENTITY_UNMANAGED_CLIENTS=disable` before this client is adopted.** It
  disables the client and every open session.
- **Install a key with `set-client-key.sh` on an adopted client.** Its keys belong to its registration.
- **Serve the BFF on `localhost:8080`, or on any port the tunnel forwards.** The tunnel rewrites the
  redirect to its own URL ([Troubleshooting](#troubleshooting)).

## Troubleshooting

| Symptom                                                                   | Cause                                                                                                    | Fix                                                                                                            |
| :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| After sign-in, the browser lands back on Keycloak instead of the BFF      | The BFF ran on a port the tunnel forwards, such as `localhost:8080`, and the tunnel rewrote the redirect | Run it on `http://127.0.0.1:8090`, as `dev-local.ps1` does. Use `127.0.0.1`, not `localhost`, for the callback |
| Keycloak answers "Restart login cookie not found"                         | The sign-in began on another host than the kernel's fixed public origin                                  | Start from the BFF, which sends the browser to the public issuer                                               |
| Keycloak answers `403` "Invalid origin"                                   | The tunnel port rewrites the browser's `Origin`                                                          | The server's operator sets `--origin-header unchanged` on that port (identity-kernel `deploy/dev/README.md`)   |
| Signing in to this BFF signs the browser out of organization-experience's | Both set `__Host-ident_session`, and a browser scopes cookies by host, not by port                       | One BFF at a time, or two browser profiles                                                                     |
| `/api/*` answers 503                                                      | identity-control does not listen on `IDENTITY_CONTROL_BASE_URL`                                          | Start it there, or point the variable at the server's through the tunnel ([Wiring](#wiring-to-other-services)) |
| `dev-local.ps1` stops with "No client key at ..."                         | The key pair was never made on this laptop                                                               | `node scripts/new-client-key.mjs`, then send the JWK                                                           |
| The token exchange is refused after the callback                          | The server holds no public key matching this laptop's private key                                        | The operator installs this laptop's JWK ([Keys](#keys))                                                        |
| Every provider route refuses the BFF's token                              | The client lost `scnehaux-provider`, for example adopted as `internal`                                   | Declare it `privileged`, `provider-scope`, as above                                                            |
| Every session ends when the BFF restarts                                  | `IDENTITY_EXPERIENCE_SESSION_KEY` changed or was emptied                                                 | Keep the value the script wrote to `.env`                                                                      |
| An account cannot sign in after failed passwords                          | The kernel's brute-force detection locked it                                                             | identity-kernel `deploy/dev/README.md` §Troubleshooting                                                        |
