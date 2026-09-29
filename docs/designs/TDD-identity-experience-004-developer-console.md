---
doc_meta:
  id: TDD-identity-experience-004
  title: Developer Console — Application Onboarding and Client Key Lifecycle
  owner: Identity Experience Team
  version: 1.2.0
  status: approved
  classification: restricted
  review_cycle_days: 90
  created_date: 2026-08-11
  last_reviewed: 2026-09-30
  parent_sad: SAD-002
---

# Developer Console — Application Onboarding and Client Key Lifecycle

## Purpose

Specify the surface through which an application team registers a protocol client or a
protected resource, configures its redirect URIs and audiences, chooses its token
lifetime class, and registers and rotates the public keys a confidential or workload client
authenticates with (`private_key_jwt`, `ADR-IAM-001 §5.12`).

`TDD-identity-control-003` specifies what registration validates and refuses. This
design specifies how a developer reaches a correct registration on the first attempt,
and how the choices with security consequences are presented as choices rather than as
form fields.

## Scope

**In scope**

- The registration request flow and where approval is required.
- Redirect URI and audience configuration, validated before submission.
- Lifetime class selection, and how its consequence is shown.
- Public-key registration, rotation, and revocation. No secret exists to issue or show.
- Integration guidance rendered from the registration itself.

**Out of scope**

- Registration validation rules and desired state — owned by
  `TDD-identity-control-003`.
- The BFF session pattern — inherited from `TDD-identity-experience-001`.
- Software Catalog, which is unchartered; the Application reference is entered
  administratively.

## Technical Context

A developer registering a client is making four decisions with security consequences,
and a form that presents them as equal fields will get three of them wrong:

| Decision | Consequence if wrong |
| :-- | :-- |
| Profile | A public client holding a refresh token, which STD-IAM-001 §3.2 prohibits |
| Redirect URIs | An open redirect, which is an account-takeover primitive |
| Audience | A token accepted by a resource nobody intended |
| Lifetime class | A revocation enforcement delay nobody chose |

The last one is the least visible and the most often defaulted. It is presented here as
a stated interval rather than as a label.

## Component Design

| Component | Responsibility |
| :-- | :-- |
| `RegistrationWizard` | Guided flow with per-step validation against the API |
| `RedirectUriEditor` | Live validation, exact-match preview, wildcard refusal with explanation |
| `LifetimeClassSelector` | Class choice presented as an enforcement interval |
| `ClientKeyPanel` | Public-key submission, the key list with states, rotation, overlap countdown, revocation |
| `IntegrationGuide` | Endpoint and claim guidance rendered from the actual registration |

## Data Model

The console stores no registration authority or credential material. Its client model
contains only the current wizard draft, API validation results, and registration views
returned by Identity Control. No secret or private key ever reaches it. Registration and
rotation carry a public key in, and nothing secret comes back, because the client generates
its key pair and keeps the private key (`TDD-identity-control-003` §Client Key Records).

## API / Interface

```text
GET   /api/v1/registrations
POST  /api/v1/registrations
GET   /api/v1/registrations/{id}
POST  /api/v1/registrations/{id}:validate
POST  /api/v1/registrations/{id}/keys
GET   /api/v1/registrations/{id}/keys
POST  /api/v1/registrations/{id}/keys/{key_id}:revoke
POST  /api/v1/registrations/{id}:retire
```

`:validate` returns the same refusals as `POST` without creating anything, so the wizard
validates each step against the authority rather than against a client-side copy of the
rules that will drift.

## Algorithms / Logic

### Where Approval Is Required

```text
non-production environment, any profile        self-service
production, resource profile                   self-service, with the lifetime class recorded
production, confidential or public profile     approval required
production, workload profile                   approval required
```

A production client with a redirect URI is a trust decision: it determines where an
authorization code may be delivered. A developer proposing one is correct; a developer
approving their own is a control gap.

Approval requests carry the proposed configuration, the requester, and the Application
reference, and the approver sees the same validated preview the requester saw.

### Redirect URI Editing

```text
on each entry:
    show the exact-match preview: this URI and no other
    refuse a wildcard, and explain that it delegates to whoever controls a matching host
    refuse a non-https scheme outside local development
    refuse a fragment or a path traversal sequence
```

The refusal explains rather than states. "Wildcards are not permitted" produces a
support ticket; "a wildcard would let anyone controlling a matching host receive your
authorization codes" produces a corrected entry.

### Lifetime Class as an Interval

The selector does not render `L0` through `L3`. It renders what each means:

| Choice | Rendered as |
| :-- | :-- |
| `L0` | Token valid 4 minutes. A revocation takes effect within about 5 minutes |
| `L1` | Token valid 9 minutes. A revocation takes effect within about 10 minutes |
| `L2` | Token valid 15 minutes. A revocation takes effect within about 16 minutes. External and partner audiences only |
| `L3` | Token valid 9 minutes. Workload audiences |

A developer choosing a longer lifetime is choosing a longer window during which a
revoked Principal keeps access to their API. Presenting that as `L2` hides the decision
inside a label; presenting it as sixteen minutes puts it where the choice is made.

The class is required for a resource registration and cannot be defaulted, matching the
database constraint in `TDD-identity-control-003`.

### The Public Key, Never the Private One

```text
on registration or rotation of a confidential or workload client:
    ask for the public key as a JWK or PEM, and explain how to generate the pair locally
    refuse, before submission, a key that is not RSA, is under 3072 bits, or carries a
        private parameter, and say that a pasted private key is exposed and must be replaced
    never offer to generate the key pair in the browser
    show the key's thumbprint, so the team can confirm it is the key they hold
```

The console never generates a key pair. A key generated in the browser would put the private
key in a page, in the browser's memory, and in whatever the user copies it into, which is the
exposure `ADR-IAM-001 §5.12` exists to remove. The team generates the pair where the private key
will live, in its deployable's secret custody, and submits only the public half.

There is no reveal control and no once-only view, because there is nothing secret to reveal.
A pasted private key is refused before it leaves the browser. Identity Control refuses it
again at the API and in the database, so a console defect cannot store one.

### Rotation

Rotation is presented as an overlap rather than a swap:

```text
rotate:
    the team submits the next public key
    it becomes active; the previous key is shown as retiring, with the remaining overlap
    countdown to the retiring key's automatic removal
    revoke: remove one key now, with a reason, for a key that has leaked
```

Showing the overlap is what makes rotation something teams do. A rotation presented as
an immediate cutover reads as an outage, and a rotation that reads as an outage gets
postponed until the key expires on its own.

### Integration Guidance

Rendered from the registration itself rather than from documentation: the issuer, the
authorization and token endpoints, the JWKS location, the audience to request, the
claims the resulting token will carry, and the verification steps required by
STD-IAM-002 §3.5. For a confidential or workload client it also renders how to build the
client assertion `STD-IAM-001 §3.2` requires:

- signed `PS256` with the registered key's `kid`;
- `iss` and `sub` set to the client ID;
- `aud` set to the realm issuer;
- a unique `jti` and a short `exp`.

Guidance generated from the actual registration cannot drift from it, which
hand-maintained documentation always does.

## Configuration

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `IDENTITY_DEVCONSOLE_APPROVAL_ENVIRONMENTS` | `production` | Environments requiring approval |

## Testing Strategy

### Validation Parity

- Every refusal the wizard shows is produced by `:validate`, not by client-side logic.
- A rule changed in the API changes the wizard's behavior without a client change,
  asserted by a contract test.

### Redirect URIs

- A wildcard is refused with the explanation, not a bare message.
- A non-https scheme outside local development is refused.
- The exact-match preview shows the single URI that will be accepted.

### Lifetime Class

- A resource registration cannot be submitted without a class.
- Each class renders its enforcement interval, not its identifier.
- Selecting `L2` for an internal audience is refused.

### Key Handling

- No response, page, storage, or telemetry of the console carries a secret or a private key.
- A pasted JWK or PEM with private parameters is refused before submission, with the
  explanation that the key is exposed. Nothing of it is sent or logged.
- A key under 3072 bits, or not RSA, is refused before submission.
- No control generates a key pair in the browser.
- The retiring key's remaining overlap is shown, and revocation requires a reason.

### Approval

- A production confidential or public registration cannot be self-approved.
- The approver sees the same validated preview as the requester.

## Security Notes

The four consequential decisions are separated from the incidental fields deliberately.
A form that treats redirect URIs and display names as equal inputs produces registrations
where the display name was considered and the redirect URI was pasted.

No secret passes through this surface, and that is a property of the system rather than a UI
choice. A registered client has no secret (`STD-IAM-001 §3.2`), and its private key never
leaves the team's deployable. The console handles public keys only, so a compromise of the
console, the BFF, or Identity Control yields nothing that authenticates as a client.

Self-approval is closed for production clients carrying redirect URIs because that
configuration decides where authorization codes are delivered. It is the one field on
this surface that an attacker with a developer account would change.

## Performance Notes

Every step validates against the API, which adds a round trip per step and removes an
entire class of drift between client-side rules and authority rules. That trade is
accepted: registration is infrequent and correctness is the point.

## Operational Notes

| Signal | Warning | Critical |
| :-- | :-- | :-- |
| Registrations awaiting approval | 3 days | 7 days |
| Client keys past 75 percent of lifetime with no successor registered | any occurrence | past 95 percent |
| Retiring keys within 24 hours of removal | any occurrence | — |
| Private keys refused at submission | any occurrence | — |
| Redirect URI refusals per requester | above baseline | — |

A retiring key near its removal is surfaced because a team that registered a new key but
still signs with the old one will fail when the old key is removed. Telling them a day ahead
is cheaper than the outage. A refused private key means someone pasted one. The key is
refused and nothing of it is stored, but it is exposed, and the team is told to replace it.

Runbooks required before production: expired client key recovery, compromised client key,
and registration approval backlog.

## Traceability

| Relationship | Target |
| :-- | :-- |
| Parent system | SAD-002 — Scnehaux Identity Experience |
| Realizes capability | PAD-PLT-001 — client and protected-resource security registration |
| Conforms to | `TDD-identity-control-003` — every rule shown here originates there |
| Governed by | ADR-IAM-001 §5.12 — confidential and workload clients authenticate with registered keys |
| Conforms to | STD-IAM-001 §3.2 — PKCE, exact redirect URIs, no secret in a public client, `private_key_jwt` for confidential and workload clients |
| Conforms to | STD-IAM-002 §3.3 — every protected resource carries exactly one lifetime class |
| Conforms to | `TDD-identity-experience-001` — BFF session and containment |
| Depends on | `identity-control` — validation, key registration and rotation, and approval |
