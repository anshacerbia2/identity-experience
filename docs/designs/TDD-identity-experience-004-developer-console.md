---
doc_meta:
  id: TDD-identity-experience-004
  title: Developer Console — Application Onboarding and Client Key Lifecycle
  owner: Identity Experience Team
  version: 1.10.0
  status: approved
  classification: restricted
  review_cycle_days: 90
  created_date: 2026-08-11
  last_reviewed: 2026-10-08
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

- Where the console is served, and what it shares with the Admin Portal.
- The owner's surface: the registrations a person owns, their keys, and their suspension and
  restoration (`ADR-IAM-003`); and the workloads a person is the accountable owner of, with their
  review dates and the owner's periodic review (`ADR-IAM-003 §5.8`, 1.10.0).
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
| `MyRegistrationsPage` | The registrations the signed-in person owns, from the owner route |
| `RegistrationPage` | One owned registration: its record, `ClientKeyPanel`, suspend and restore, its redirect URI changes, and its owners |
| `RedirectUriChanges` | The registered redirect URIs, a proposal of the next set, the open change with its before and after, and the changes decided |
| `RegisterPage` | A non-production registration by an application developer, offered only where the API accepts one |
| `MyWorkloadsPage` | The workloads the signed-in person owns, from `GET /v1/workloads:mine`, each with its state, last review and next review due, an overdue one marked (1.10.0) |
| `WorkloadPage` | One owned workload: its record and the owner's periodic review, with a statement (1.10.0) |
| `RegistrationWizard` | Guided flow with per-step validation against the API |
| `RedirectUriEditor` | Live validation, exact-match preview, wildcard refusal with explanation |
| `LifetimeClassSelector` | Class choice presented as an enforcement interval |
| `ClientKeyPanel` | Public-key submission, the key list with states, rotation, overlap countdown, revocation |
| `IntegrationGuide` | Endpoint and claim guidance rendered from the actual registration |

### Delivery

The console is its own application, `apps/developer`, built with Vite under the base path
`/developer/` and served by the Identity Experience BFF beside the Admin Portal
(`TDD-identity-experience-001` §Runtime). It uses the same session, the same CSRF token and
the same `/api` proxy, so a person signed in to one is signed in to the other, and the BFF
holds one session for them.

It is a separate application rather than a section of the Admin Portal because SAD-002 §4.1
names the two as separate containers, and SAD-002 §9.4 lets them release independently within
their compatibility contracts. A section of the Portal would ship every console change with
the Portal and put the console's pages in the Portal's bundle for every operator.

The two share what must not differ between them in `packages/app-core`: API access and its
error handling, the session, the query client, preferences, the registration read model, the
reason field, and the frame every page renders in. A rule changed for one is changed for both.
Their pages, their navigation and their message catalogues are their own, and each catalogue
spreads the shared strings into itself.

A sign-in started from the console returns to it, and one that does not complete lands on
`/developer/` with its marker (`TDD-identity-experience-001` §Sign-in).

## Data Model

The console stores no registration authority or credential material. Its client model
contains only the current wizard draft, API validation results, and registration views
returned by Identity Control. No secret or private key ever reaches it. Registration and
rotation carry a public key in, and nothing secret comes back, because the client generates
its key pair and keeps the private key (`TDD-identity-control-003` §Client Key Records).

## API / Interface

```text
GET   /api/v1/registrations:mine                        owner
GET   /api/v1/registrations/{id}                        owner of {id}
POST  /api/v1/registrations/{id}:suspend                owner of {id}, with a reason
POST  /api/v1/registrations/{id}:restore                owner of {id}, with a reason
GET   /api/v1/registrations/{id}/keys                   owner of {id}
POST  /api/v1/registrations/{id}/keys                   owner of {id}
POST  /api/v1/registrations/{id}/keys/{key_id}:revoke   owner of {id}, with a reason
GET   /api/v1/registrations/{id}/owners                 owner of {id}
POST  /api/v1/registrations/{id}/changes                owner of {id}, with a reason; redirect URIs or audience
GET   /api/v1/registrations/{id}/changes                owner of {id}
POST  /api/v1/registrations/{id}/changes/{c}:withdraw   its proposer, with a reason
GET   /api/v1/registrations:standing                    any signed-in person: its own standing
POST  /api/v1/registrations                             application developer, non-production
POST  /api/v1/registration-requests                     application developer, production, with a reason
GET   /api/v1/registration-requests:mine                its own requests
POST  /api/v1/registration-requests/{r}:withdraw        its proposer, with a reason
GET   /api/v1/workloads:mine                            any signed-in person: the workloads it owns
GET   /api/v1/workloads/{principal_id}                  owner of {principal_id}
POST  /api/v1/workloads/{principal_id}:review           owner of {principal_id}, with a statement
POST  /api/v1/registrations/{id}:validate               not yet
```

The right-hand column is what the Identity Control API checks for a caller with no provider
scope (`TDD-identity-control-003` §Registration Ownership). Retirement, drift exceptions and
owner changes are a provider's, so the console offers none of them. It never reads
`GET /api/v1/registrations`, which lists every registration and is a provider's.

`:validate` returns the same refusals as `POST` without creating anything, so the wizard
validates each step against the authority rather than against a client-side copy of the
rules that will drift.

## Algorithms / Logic

### Ownership

```text
the session's token carries provider_scope only when its holder is a provider
the console reads GET /v1/registrations:mine for the registrations the person owns
a registration the person does not own answers 404, and the console shows it as not found
an action the API refuses an owner is not offered
an empty list says that a provider grants ownership, and how to ask

on one owned registration:
    show its record, as the Admin Portal shows it
    list its keys; rotate to a pasted public key; revoke one with a reason
    offer suspend for an active client and restore for a suspended one, each with a reason
    never offer retirement: it is a provider's
    list its active owners, marking the signed-in one; no control changes them
```

The record, the key panel and the lifecycle controls are the Admin Portal's own, shared through
`packages/app-core`; in the console the lifecycle controls offer only what an owner may do, and
say that retirement is a provider's. Owners are listed by `principal_id`, the identifier the API
returns, with when and why each was granted; revoked ownerships stay in the API's record and are
not listed. Granting and revoking an owner are a provider's (`POST …/owners` and `…:revoke` refuse an
owner before anything is read), so the console offers neither, by that reason; the Admin Portal does
(`TDD-identity-experience-003` 1.21.0 §Registration Ownership).

**A workload's owner reviews it here (1.10.0).** identity-control serves the owner's read
(`ADR-IAM-003 §5.8`, `TDD-identity-control-004` 1.7.0), which 1.9.0 waited on:

```text
"My workloads" lists GET /v1/workloads:mine, oldest first:
    name, client_key, state, last reviewed (or never), next review due
    a due date already passed is marked overdue
    an empty answer, null included, says that a provider creates a workload and names its owner

on one workload, GET /v1/workloads/{principal_id}:
    a workload the person does not own answers 404, and the console shows it as not found
    show its record: principal_id, client_key, type, purpose, team, owner since,
        last authenticated, last reviewed, next review due
    offer the review only to its owner, of an active workload (mayReview)
    the review sends one line as X-Administrative-Reason, the owner's statement,
        with the session's CSRF token and an Idempotency-Key; the answer replaces the record
    never offer reassign, suspend, restore, retire or rebuild: each is a provider's, and the page
        says so
```

The workload record and `mayReview` are `packages/app-core/src/domain/workload.ts`, shared with the
Admin Portal's Workloads page (`TDD-identity-experience-003` 1.22.0 §Workloads), so both offer the
review by one rule. A provider who owns a workload sees it in the list like any owner; opening it is
the provider's read, which asks a provider to step up to `aal2` first, and the step-up is offered as
any other (`TDD-identity-experience-001` §Step-Up). The review goes through the BFF's `/api` proxy as
every command does: the proxy forwards the path and the two headers and decides nothing.

The console holds no authority of its own. Which registrations a person owns is the
Identity Control API's record, checked on every request (`ADR-IAM-003`), and the console
shows what the API answers for the owner. It asks only the owner routes, so a provider
using it sees what they own, as any owner does, and not every registration.

### Registering a Client

`ADR-IAM-003 §5.3` lets an application developer create non-production registrations
(`TDD-identity-control-003` §Application Developers).

```text
read GET /v1/registrations:standing
offer "Register a client" to an application developer outside production
offer "Request a production client" to an application developer in production: the same form,
    with at least two owners named by principal_id and a reason, sent as a request
    (`TDD-identity-control-003` §Registration Requests); a provider other than the proposer
    approves it in the Admin Portal, and the console says so
the form offers what an application developer may register, and nothing else:
    profile public, confidential or resource
    audience class internal or external
    a resource's lifetime class, rendered as its interval (§Lifetime Class as an Interval)
    a client's audience chosen from the resources the person owns
    a confidential client's first public key, as §The Public Key, Never the Private One requires
    a public or confidential client's redirect URIs, one per line
send it once, under an Idempotency-Key kept for the same values, so a retry creates nothing new
the API validates; a refusal is shown in its own words
on success, open the new registration's page: its creator is its first owner
on a request's success, say it waits for another provider; the person's requests are listed on
    My registrations with their state, the decision's reason, and the registration an approval
    created; an open one is withdrawn with a reason
```

The form is one page rather than §RegistrationWizard's steps. Those wait on `:validate`, which
Identity Control has not built. Without `:validate`, a step-by-step wizard would validate each
step in the browser, which §Validation Parity forbids. So the form submits once, and the API's
refusal names the rule.


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

### Redirect URI Changes

A registration's redirect URIs change by a change the Identity Control API records
(`TDD-identity-control-003` §Registration Changes), not by editing the registration.

```text
on an active public or confidential registration:
    show the registered redirect URIs
    propose the whole next set, one URI per line, with a reason, against the version shown
    the API validates; a refusal is shown in its own words, beside why each rule exists
    outside production the change applies at once; in production it waits for a provider
        other than the proposer, and the page says so
    the open change is shown as its before and after; its proposer withdraws it with a reason
    a version conflict says the registration changed since it was read, and reads it again
    decided changes are listed with their outcome, who decided, and why
    a registration's changes include audience changes; each is labelled by its kind and shown
        with that kind's before and after, never read as redirect URIs
```

The API returns redirect URI changes and audience changes in one list, each with a `kind`, and
leaves the other kind's before and after `null`. The page reads the pair its kind names, so an
audience change in the history does not break the page. Proposing one is §Audience Changes (1.8.0).

The console sends the whole set rather than an edit, because the API pins a change to the set it
replaces, and the approver sees both. Nothing is validated in the browser beyond splitting the
lines: §Validation Parity holds, and the API's sentence names the rule. The page lists why each
rule exists next to the form, which is the explanation §Redirect URI Editing asks for, written once
rather than per refusal.

A provider sees the same changes on the Admin Portal's registration page, with approve and reject
for a change it did not propose, and every open change in the portal's approval queue
(`TDD-identity-experience-003` §Change Approval).

### Audience Changes

**Added in 1.8.0**, on `TDD-identity-control-003` §Registration Changes (its 1.26.0). A client's
audience is the set of resources whose `client_key` its access tokens name in `aud`. It changes by the
same recorded change as its redirect URIs, of kind `audience`.

```text
on an active public, confidential or workload registration:
    show the registered audience, or say that its tokens name no resource
    propose the whole next audience, one resource client_key per line, with a reason, against the
        version shown; an empty set is a change to no resource, sent as []
    a change names one kind: the body carries audience or redirect_uris, never both
    the API holds one open change per registration, of either kind: while one is open, neither
        proposal is offered
    the API validates; a refusal is shown in its own words, beside why each rule exists
    outside production it applies at once; in production it waits for a provider other than the
        proposer, and the page says so
    the open change is shown as the resources it adds, removes and keeps, labelled as an audience
a resource registration has no audience: nothing is offered on it
```

- **Why the audience is governed.** A token that names a resource can be presented to it, and RFC 8707
  gives the audience its point: "An audience-restricted access token that is legitimately presented to
  a resource cannot then be taken by that resource and presented elsewhere for illegitimate access to
  other resources" [R1]. So adding a resource is the resource owners' decision as much as the client's.
  The API admits an owner's addition only of a resource it owns, and a provider's of any registered
  resource. Removing is never restricted: a narrower audience only takes access away
  (`TDD-identity-control-003` §Registration Changes).
- **A list typed, not a picker.** The form is one `client_key` per line, the registered set filled in.
  A picker would have to list what the person may add, which is a rule of the API's: an owner's own
  resources, or for a provider every resource, which only the provider's paged list holds. The API
  names a refused entry, and §Validation Parity holds.
- **Lifetime-class changes are not offered.** The API does not accept them yet
  (`TDD-identity-control-003` §Registration Changes), and nothing here asks for one.

The Admin Portal shows the same panel, as for redirect URIs (`TDD-identity-experience-003` §Change
Approval). On a workload registration, which has no redirect URIs, the panel is the audience alone.

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

An owner rotates and revokes its own client's keys here (`ADR-IAM-003`). The same panel serves
providers in the Admin Portal (`TDD-identity-experience-003` §Registration Drift Oversight),
for a registration whose owners cannot act.

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
| `IDENTITY_EXPERIENCE_DEVELOPER_WEB_ROOT` | none | The BFF's: the console's build, served under `/developer/` (`TDD-identity-experience-001` §Configuration) |

## Testing Strategy

### Ownership

- The console lists the registrations the owner route returns, and an empty answer, `null`
  included, says how ownership is granted.
- The console never reads the provider's list, `GET /api/v1/registrations`.
- A signed-out visitor is asked to sign in, and the sign-in returns under `/developer/`.
- A failed read states the failure and its reference, and offers to try again.
- A registration's page offers suspend for an active client and restore for a suspended one,
  each sending its reason, and never retirement.
- A registration the API answers 404 for, one the person does not own, is shown as not found.
- The owners list shows active owners only, marks the signed-in person, and offers no control.
- Rotation sends the pasted public key and nothing else.
- A redirect URI proposal sends the whole set, the version read and the reason. An applied change
  and a waiting one read differently, and a waiting one is withdrawn by its proposer with a reason.
- A version conflict reads the registration again; a refusal shows the API's sentence.
- An audience proposal sends the whole set, `[]` included, the version read and the reason, and never
  `redirect_uris` with it. An owner's refused addition shows the API's sentence. An open audience
  change is labelled as one, and no second proposal of either kind is offered while it is open. A
  workload's owner is offered an audience change and no redirect URIs; a resource, and a client that
  is not active, are offered none (1.8.0, `apps/developer/src/features/registrations/RegistrationPage.test.tsx`).
- The console offers no approval: approving is a provider's, in the Admin Portal.
- "My workloads" lists what `GET /api/v1/workloads:mine` returns with each workload's last review and
  next review due, marks a due date already passed as overdue, and never reads a provider listing; an
  empty answer, `null` included, says how a workload comes to be owned (1.10.0,
  `apps/developer/src/features/workloads/WorkloadPage.test.tsx`).
- A workload's page shows its record and dates. Its owner's review of an active workload sends the
  statement as `X-Administrative-Reason`, the CSRF token and an Idempotency-Key, and a refusal shows the
  API's sentence. A workload that is not active, or is not the person's, offers no review, and no
  provider action is ever offered. A workload the API answers 404 for is shown as not found.
- "Register a client" is offered only to an application developer outside production. The form
  offers no workload profile and no privileged class, and its audience lists only the person's
  own resources.
- A registration is sent under an Idempotency-Key that is reused for the same values. A success
  opens the new registration, and a refusal shows the API's sentence.
- In production the form sends a request naming its owners, one per line, at least two, the
  signed-in person first; the request is listed with its state, and withdrawn with a reason.

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
| Governed by | ADR-IAM-003 — a registration's owners act on it; a production change is approved by another provider |
| Governed by | ADR-IAM-003 §5.8 — a workload's owner lists, reads and reviews it; another's workload is not found |
| Depends on | `TDD-identity-control-004` 1.7.0 — `GET /v1/workloads:mine`, the owner's `GET /v1/workloads/{principal_id}` and `:review` |
| Conforms to | SAD-002 §4.1 — the Developer Identity Console is its own container behind the same BFF |
| Conforms to | STD-IAM-001 §3.2 — PKCE, exact redirect URIs, no secret in a public client, `private_key_jwt` for confidential and workload clients |
| Conforms to | STD-IAM-002 §3.3 — every protected resource carries exactly one lifetime class |
| Conforms to | `TDD-identity-experience-001` — BFF session and containment |
| Depends on | `identity-control` — validation, key registration and rotation, and approval |

## References

| Ref | Source |
| :-- | :-- |
| R1 | IETF RFC 8707, *Resource Indicators for OAuth 2.0*, §3, <https://www.rfc-editor.org/rfc/rfc8707>, accessed 2026-10-07: "An audience-restricted access token that is legitimately presented to a resource cannot then be taken by that resource and presented elsewhere for illegitimate access to other resources." |
