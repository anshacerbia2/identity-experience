---
doc_meta:
  id: TDD-identity-experience-003
  title: Identity Administration and Investigation
  owner: Identity Experience Team
  version: 1.5.0
  status: approved
  classification: restricted
  review_cycle_days: 90
  created_date: 2026-08-11
  last_reviewed: 2026-09-29
  parent_sad: SAD-002
---

# Identity Administration and Investigation

## Purpose

Specify the surfaces through which an identity administrator acts on Principals other
than themselves: finding them, inspecting their security state, containing them, and
reading the evidence of what happened.

SAD-001 §7.2 restricts Keycloak Admin Console access and states it is not the ordinary
enterprise administration interface. This is the interface that replaces it, which means
it inherits the obligation to be safer than the console rather than merely prettier.

## Scope

**In scope**

- Principal search, and why search is itself a privileged operation.
- Security state inspection: sessions, authenticators, federation links, findings.
- Containment: quarantine, session termination, authenticator revocation.
- Reason and evidence capture on every privileged action.
- The self-action boundary.
- Oversight of protocol client registrations and their drift.

**Out of scope**

- The BFF session pattern and step-up mechanics — inherited from
  `TDD-identity-experience-001`.
- Self-service account security — owned by `TDD-identity-experience-002`.
- Organization, Tenant, and Membership administration — `organization-experience`.
- The reconciler findings themselves — produced by `identity-control`.

## Technical Context

Two properties separate this surface from self-service.

**The subject is someone else.** Every action has a person on the other end who did not
consent to it and may not know it happened. That makes reason capture and evidence a
requirement rather than a nicety, and it makes reads as consequential as writes.

**Search is disclosure.** An unconstrained Principal search over the workforce is a
directory export waiting to happen. The console this interface replaces offers exactly
that, and reproducing it would replace one enumeration surface with a friendlier one.

## Component Design

| Component | Responsibility |
| :-- | :-- |
| `PrincipalSearch` | Scoped, logged lookup; never an unbounded listing |
| `SecurityStateView` | Sessions, authenticators, federation links, findings for one subject |
| `ContainmentActions` | Quarantine, terminate sessions, revoke authenticators |
| `EvidencePanel` | Renders privileged-administration events for the subject |

## Data Model

This experience owns no authoritative Principal or security state. It holds only
request-scoped, paged view models returned by `TDD-identity-control-005`: canonical
Principal summaries, normalized session and authenticator records, findings, and
evidence events. Opaque security references remain in memory for the rendered page and
are discarded on navigation or sign-out; they are never persisted in browser storage.

## API / Interface

```text
GET   /api/v1/principals:search
GET   /api/v1/principals/{principal_id}
GET   /api/v1/principals/{principal_id}/sessions
GET   /api/v1/principals/{principal_id}/authenticators
GET   /api/v1/principals/{principal_id}/findings
POST  /api/v1/principals/{principal_id}:quarantine
POST  /api/v1/principals/{principal_id}:release
POST  /api/v1/principals/{principal_id}/sessions:terminate-all
POST  /api/v1/principals/{principal_id}/authenticators/{id}:revoke
GET   /api/v1/principals/{principal_id}/events
```

Every mutation carries an idempotency key, an optimistic version, a reason, and a
correlation identifier. The reason is a required field on the request, not a prompt
after the fact.

`TDD-identity-control-005` defines the matching upstream routes. The BFF removes the
`/api` prefix and forwards the verified access token; it does not translate canonical
Principal identifiers into kernel identifiers or make an authorization decision.

## Algorithms / Logic

### Search Is Not Listing

```text
search(query):
    reject an empty or wildcard-only query
    require a minimum specificity
    return a bounded page, never the full set
    record the query, the actor, and the result count as a privileged read
```

There is no "list all Principals" surface. An administrator who needs a population
answers that question through a report with a stated purpose, not through a search box
that happens to accept an empty string.

Recording the query alongside the actor is what makes a slow enumeration visible. One
search is administration; four hundred searches in an hour is an export.

### Reads Are Privileged Too

Viewing another Principal's sessions, authenticators, or federation links emits a
privileged-administration event. That is unusual for a read and it is deliberate: the
information disclosed is exactly what an attacker preparing an account takeover would
want, and an administrator's read of a colleague's security state should be as
reconstructible as a write.

### The Self-Action Boundary

```text
if subject == acting administrator:
    quarantine        refuse
    release           refuse
    revoke own last authenticator   refuse
    terminate own sessions          permit, through self-service
```

An administrator cannot quarantine themselves, and more importantly cannot release
themselves. Permitting self-release would make quarantine advisory for anyone holding
the administrative role, which is precisely the population it must apply to.

Self-service actions remain available through `TDD-identity-experience-002`. The refusal
here is about acting on oneself *as an administrator*, where the four-eyes expectation
applies.

### Containment Is Reversible First

| Action | Reversible | Confirmation |
| :-- | :-- | :-- |
| Terminate sessions | The subject signs in again | Reason |
| Quarantine | Release restores | Reason, and the effect stated plainly |
| Revoke an authenticator | The subject re-enrolls, if another factor remains | Reason, and the remaining factor count shown |
| Retire a Principal | **No** | Reason, typed confirmation of the identifier, and the count of Memberships that end |

Quarantine disables rather than deletes, on the same reasoning as the reconciler in
`TDD-identity-control-001`: a false positive caused by a mistaken administrator is
recoverable, and deletion of a Principal is not.

Revoking an authenticator shows the remaining count before the action, because revoking
the last one locks the subject out and the administrator is the one person who will not
notice.

### Evidence

The evidence panel renders privileged-administration events for the subject: actor,
action, reason, correlation, assurance, and outcome. It renders the enterprise record
rather than a local log, so what an administrator sees during an investigation is what
an auditor will see afterwards.

### Registration Drift Oversight

The same console shows the realm's protocol client registrations and what the
reconciler found between them and Keycloak (`TDD-identity-control-003`). Before this, the
Admin Console was the only place to see a client, and it shows the client as Keycloak
holds it now, with no desired state to compare it against and no record of who changed
it.

```text
GET   /api/v1/registrations                      one page, ?after=&limit=&state=
GET   /api/v1/registrations/{registration_id}
GET   /api/v1/registrations/{registration_id}/findings
GET   /api/v1/registrations:drift
POST  /api/v1/registrations:reconcile            a sweep; with findings and a reason, apply
POST  /api/v1/registrations/{registration_id}/drift-exceptions
GET   /api/v1/registrations/{registration_id}/drift-exceptions
```

**The list.** The list is paged by the API's cursor. "Load more" appends the next page
and never restarts from the first. It is listing, not search, which the Principal rule
above forbids for people. A client registration discloses no person, and the population
is bounded by what was registered, so an unbounded read of it is not a directory export.
The state filter lives in the URL. A value the API does not know is dropped before any
request, rather than sent.

**Drift beside each client.** Each client carries its count of open findings. The page
opens with the last run's outcome and time, the number of open findings, and how many of
those wait for an operator: `blocked`, `unattributed` or `missing`, the ones a scheduled
sweep will not settle on its own. Every outcome is a word and a glyph, never a colour
alone.

**One registration.** A registration's page shows it as desired state records it,
and every finding for it, newest first. Findings that have converged are included,
because a repaired console change is the evidence it happened. A converged finding
shows how long the change lasted, from the admin event's time to convergence, which is
the measure the drift proof reports.

**Drift exceptions.** The same page lists the registration's drift exceptions, newest
first. Each row shows the field class, the Keycloak user it names, the reason, the
granting Principal, and when it ends. Expired exceptions stay listed, because each is the
record of why a `sanctioned` change was left in place. Each row says whether the
exception is in force, judged against the moment the list was read so every row uses the
same clock. The list is read again after an exception is granted. It is shown for any
registration, and the grant form below it only for an `active` one.

**Actions.** Three commands, each carrying the session's CSRF token. None is retried
behind the operator's back. The page never offers an action the API would refuse.

| Action | Offered for | Collected before submission |
| :-- | :-- | :-- |
| Run a sweep now | always | nothing: it applies only what a scheduled sweep would |
| Apply the registered state | one open `blocked`, `unattributed` or `missing` finding | a reason, sent as `X-Administrative-Reason` and recorded on the finding |
| Grant a drift exception | an `active` registration | the field class (`redirect_uris` or `token_lifespan`), the Keycloak user ID who will make the change, a duration of 1, 4, 8 or 24 hours, and a reason |

A reason is at least ten characters and at most 500. It travels in an HTTP header, which
holds one line of Latin-1, so line breaks typed in the form become spaces, and a
character outside Latin-1 is refused in the form with a message. Without that check it
would fail inside the browser's fetch, where no message can say why.

A refusal (4xx) is shown with the API's own sentence, attributed to the API ("The API
said: …"), together with the correlation identifier. The Identity Control API writes that
sentence to name the rule that refused, never a stored value, and an operator acting on
a refusal needs the rule. Any other failure is described in the application's own words.
After any command settles, every registration read is repeated: a sweep or a resolution
changes the summary, the counts, and the findings.

### Principal Provisioning and Portability

Principal search and a Principal's security state (§API / Interface above) depend on
`TDD-identity-control-005`, which is not built upstream. What the Identity Control API
offers today comes from `TDD-identity-control-001`, and the console shows that and
nothing more:

```text
POST  /api/v1/principals                    Idempotency-Key
GET   /api/v1/principals:dangling
POST  /api/v1/principals/{principal_id}:relink   X-Administrative-Reason
POST  /api/v1/principals:reconcile
```

**Creating a Principal.** Creation takes the kind (person or workload), a username, an
optional email and, for a workload only, the accountable owner's `principal_id`. The
console shows the `principal_id` the API issued. For a person, it adds that Keycloak asks
them to set a password at first sign-in: identity-control creates the user with a
required action and never holds a credential, so nothing here collects one. The request
carries an Idempotency-Key. The key is kept per distinct request: resubmitting the same
values after an outage reuses it, so the API returns the Principal the first attempt
created. Changing a value takes a new key, because the API refuses a key reused for a
different request.

**Dangling mappings.** A Principal whose Keycloak user is gone is listed by
`principal_id` with the time it was detected. It keeps its `principal_id` and every
Membership. **Relink** requires a reason, sent as `X-Administrative-Reason`, and says
where the Principal ended. It is `active` under a new user when recovery completed at
once, and `pending` when the scheduled recovery will finish it. This list is bounded by
what the sweep found, not by the Principal population, so it is not the listing
§Search Is Not Listing rules out. No page lists every Principal. **Run the Principal
sweep now** runs pending recovery and the dangling-mapping sweep, as the schedule does,
and reports how many it recovered and how many it found dangling.

A read that fails states why in words chosen from the status, and shows the correlation
identifier an operator quotes. It never renders the server's detail text as the
application's own. A 401 means the BFF ended the session, so the shell reads the session
again and shows the user signed out rather than a page of errors.

## Configuration

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `IDENTITY_ADMIN_SEARCH_MIN_LENGTH` | `3` | Minimum query specificity |
| `IDENTITY_ADMIN_SEARCH_PAGE` | `25` | Results per page |
| `IDENTITY_ADMIN_SEARCH_RATE_ALERT` | `60/h` | Searches per actor above which enumeration is suspected |

## Testing Strategy

### Search

- An empty or wildcard-only query is refused.
- A query below the minimum length is refused.
- No endpoint returns an unbounded Principal listing.
- Every search emits a privileged read event carrying the query and the result count.

### Privileged Reads

- Viewing another Principal's sessions, authenticators, or federation links emits an
  event.
- Viewing one's own does not, because that path is self-service.

### Self-Action

- An administrator cannot quarantine themselves.
- An administrator cannot release themselves from quarantine.
- Self session termination remains available through self-service.

### Containment

- Quarantine disables and does not delete; release restores.
- Revoking an authenticator displays the remaining factor count before submission.
- Retiring a Principal requires typed confirmation and shows the count of Memberships
  that end.
- Every mutation carries a reason; a request without one is refused by the API.

### Registrations and Drift

- The list follows the API's cursor, and loading more appends the next page.
- A state the API does not know is dropped from the URL's filter, not sent.
- A registration's open findings are counted beside it, and the drift summary counts the ones
  that wait for an operator.
- Converged findings are shown with their convergence time.
- A refused read shows the correlation identifier. A 401 shows the user signed out.
- Without a session, nothing is requested from the API.
- Apply is offered only for open blocked, unattributed or missing findings. It sends the finding
  and the reason, normalized to one line, with the CSRF token.
- A reason that is too short, or has characters a header cannot carry, is refused before sending.
- A drift exception is offered only for an active registration, with only the field classes and
  durations the API accepts. It requires the Keycloak user ID.
- Drift exceptions are listed newest first, expired ones included, each marked in force or
  expired. The list is read again after a grant, and is still shown for a registration that
  is not active.
- A refusal is shown with the API's sentence, attributed to it, and with its reference.

### Principals

- Only the dangling mappings are read: no request lists the Principal population.
- Creating a person or a workload sends an Idempotency-Key and the CSRF token. A workload
  requires its owner as a principal_id.
- The same request resubmitted after an outage reuses its key, and a changed one takes a new key.
- Relink requires a reason and states whether the Principal ended active or pending.
- A refused relink is shown with the API's sentence.

## Security Notes

This interface exists because the Admin Console is not an acceptable enterprise
administration surface. Replacing it with a surface that offers the same unbounded
search and the same unlogged reads would move the problem rather than solve it, which is
why search is constrained and reads are evented here and are not in the console.

The self-release refusal is the one control that would be easy to omit and would quietly
void quarantine. An administrator who can release themselves cannot be contained by the
mechanism, and administrators are the accounts most worth containing.

Every privileged action carries a reason collected before submission. A reason recorded
afterwards is written by someone who already knows how it turned out.

## Performance Notes

All surfaces are paged reads through the BFF. Search is bounded by minimum specificity
and page size, so its cost is fixed regardless of the Principal population.

## Operational Notes

| Signal | Warning | Critical |
| :-- | :-- | :-- |
| Searches per actor per hour | above the configured rate | ten times it |
| Privileged reads per actor per day | above baseline | — |
| Quarantine without a subsequent release or retirement | 30 days | — |
| Self-action refusal | any occurrence | — |

A self-action refusal is worth surfacing even though it worked. It means an
administrator attempted to act on themselves through the administrative path, and the
reason matters.

Runbooks required before production: suspected directory enumeration, quarantine
review, and locked-out subject after authenticator revocation.

## Traceability

| Relationship | Target |
| :-- | :-- |
| Parent system | SAD-002 — Scnehaux Identity Experience |
| Realizes capability | PAD-PLT-001 — identity administration and investigation |
| Governed by | SAD-001 §7.2 — the Admin Console is not the enterprise administration interface |
| Conforms to | `TDD-identity-experience-001` — BFF session, step-up, containment |
| Conforms to | EAD-006 §5.3 — privileged access is scoped, attributable, time-bounded, and evidenced |
| Depends on | `TDD-identity-control-005` - every refusal, guard, privileged-read event, and containment operation originates there |
| Depends on | `TDD-identity-control-003` - registrations, their findings, and the reconciler's runs |
| Depends on | `TDD-identity-control-001` - Principal creation, dangling mappings, and relink |
