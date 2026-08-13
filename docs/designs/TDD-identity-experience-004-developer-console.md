---
doc_meta:
  id: TDD-identity-experience-004
  title: Developer Console — Application Onboarding and Credential Lifecycle
  owner: Identity Experience Team
  version: 1.1.0
  status: approved
  classification: restricted
  review_cycle_days: 90
  created_date: 2026-08-11
  last_reviewed: 2026-08-14
  parent_sad: SAD-002
---

# Developer Console — Application Onboarding and Credential Lifecycle

## Purpose

Specify the surface through which an application team registers a protocol client or a
protected resource, configures its redirect URIs and audiences, chooses its token
lifetime class, and rotates its credentials.

`TDD-identity-control-003` specifies what registration validates and refuses. This
design specifies how a developer reaches a correct registration on the first attempt,
and how the choices with security consequences are presented as choices rather than as
form fields.

## Scope

**In scope**

- The registration request flow and where approval is required.
- Redirect URI and audience configuration, validated before submission.
- Lifetime class selection, and how its consequence is shown.
- Credential issue, rotation, and the once-only secret.
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
| `CredentialPanel` | Once-only secret display, rotation, overlap countdown |
| `IntegrationGuide` | Endpoint and claim guidance rendered from the actual registration |

## Data Model

The console stores no registration authority or credential material. Its client model
contains only the current wizard draft, API validation results, and registration views
returned by Identity Control. A once-only secret exists only in the in-memory response
model for the issue or rotation screen and is destroyed when that screen is left; it is
excluded from caches, telemetry, browser persistence, and state rehydration.

## API / Interface

```text
GET   /api/v1/registrations
POST  /api/v1/registrations
GET   /api/v1/registrations/{id}
POST  /api/v1/registrations/{id}:validate
POST  /api/v1/registrations/{id}/credentials:rotate
POST  /api/v1/registrations/{id}/credentials/{cid}:revoke
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

### The Once-Only Secret

```text
on issue or rotation:
    display the secret once, with a copy control
    display no reveal control, because there is nothing to reveal later
    state plainly that it cannot be retrieved and that losing it means rotating
    require explicit acknowledgement before leaving the view
```

The secret is never written to client storage, never included in a page the browser
caches, and never present in any subsequent response. A "show secret" control on a
registration detail page would require the secret to be retrievable, which
`TDD-identity-control-003` refuses on purpose.

### Rotation

Rotation is presented as an overlap rather than a swap:

```text
rotate:
    new credential issued and displayed once
    previous credential shown as retiring, with the remaining overlap
    countdown to automatic revocation
```

Showing the overlap is what makes rotation something teams do. A rotation presented as
an immediate cutover reads as an outage, and a rotation that reads as an outage gets
postponed until the credential expires on its own.

### Integration Guidance

Rendered from the registration itself rather than from documentation: the issuer, the
authorization and token endpoints, the JWKS location, the audience to request, the
claims the resulting token will carry, and the verification steps required by
STD-IAM-002 §3.5.

Guidance generated from the actual registration cannot drift from it, which
hand-maintained documentation always does.

## Configuration

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `IDENTITY_DEVCONSOLE_APPROVAL_ENVIRONMENTS` | `production` | Environments requiring approval |
| `IDENTITY_DEVCONSOLE_SECRET_ACK_REQUIRED` | `true` | Explicit acknowledgement before leaving the secret view |

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

### Secret Handling

- The secret appears exactly once, at issue and at rotation.
- No reveal control exists on any detail view.
- The secret is absent from client storage and from every cached response.
- Leaving the view without acknowledgement prompts.

### Approval

- A production confidential or public registration cannot be self-approved.
- The approver sees the same validated preview as the requester.

## Security Notes

The four consequential decisions are separated from the incidental fields deliberately.
A form that treats redirect URIs and display names as equal inputs produces registrations
where the display name was considered and the redirect URI was pasted.

The absence of a reveal control is a property of the system rather than a UI choice.
`TDD-identity-control-003` stores no secret value, so there is nothing this surface
could reveal, and building a reveal control would require weakening that.

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
| Credentials past 75 percent of lifetime without rotation | any occurrence | past 95 percent |
| Rotations abandoned mid-overlap | any occurrence | — |
| Redirect URI refusals per requester | above baseline | — |

An abandoned rotation means a team issued a new secret and never adopted it, so the
automatic revocation at the end of the overlap will break them. It is surfaced before
that happens.

Runbooks required before production: expired credential recovery, abandoned rotation,
and registration approval backlog.

## Traceability

| Relationship | Target |
| :-- | :-- |
| Parent system | SAD-002 — Scnehaux Identity Experience |
| Realizes capability | PAD-PLT-001 — client and protected-resource security registration |
| Conforms to | `TDD-identity-control-003` — every rule shown here originates there |
| Conforms to | STD-IAM-001 §3.2 — PKCE, exact redirect URIs, no secret in a public client |
| Conforms to | STD-IAM-002 §3.3 — every protected resource carries exactly one lifetime class |
| Conforms to | `TDD-identity-experience-001` — BFF session and containment |
| Depends on | `identity-control` — validation, issue, rotation, and approval |
