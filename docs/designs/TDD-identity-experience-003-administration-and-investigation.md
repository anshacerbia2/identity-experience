---
doc_meta:
  id: TDD-identity-experience-003
  title: Identity Administration and Investigation
  owner: Identity Experience Team
  version: 1.17.1
  status: approved
  classification: restricted
  review_cycle_days: 90
  created_date: 2026-08-11
  last_reviewed: 2026-10-01
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
- Containment: suspension, session termination, authenticator revocation.
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
| `ContainmentActions` | Suspend and restore, terminate sessions, revoke authenticators |
| `EvidencePanel` | Renders privileged-administration events for the subject, once the Audit API serves them |
| `ChangeQueue` | Every registration change waiting for approval, oldest first, approved or rejected with a reason |

### Navigation

**The navigation is grouped by what an administrator acts on, never by which system implements
it.** A session, an authenticator or a consent is held by the kernel, and a registration, an
ownership or a workload by the Identity Control API. An administrator investigating a Principal needs
both on one page and does not know, and should not need to know, which system answers. NN/g:
"Organizations often categorize components using schemes that are familiar to them. For example,
they mirror their organizational charts … Instead, research your user base to determine _their_
mental models" [R1]. Its intranet studies found that "task-based structures often endured better
than intranets organized departmentally", and that task-based navigation "tends to facilitate
ease-of-learning" [R2]. Microsoft Entra does the same. Users, groups, devices, enterprise
applications and app registrations sit side by side under one product area, whatever answers each
[R3], and the admin center is a separate portal from the one where a user manages their own
security info [R4].

**Three applications, by audience.** The account application is a person acting on their own
account (`TDD-identity-experience-002`), as Entra's My Account is [R4]. The Developer Console is a
person acting on their own applications (`TDD-identity-experience-004`). This Admin Portal is a
provider acting on others. No administrative action appears in the account application, and no
self-service action in this portal: the self-action boundary (§The Self-Action Boundary) is also a
boundary between applications.

**The Admin Portal's groups**, each shown once it holds a built page:

| Group | Pages | Answered by |
| :-- | :-- | :-- |
| (none) | Overview | both |
| Identities | Principals, and one Principal's security state: sessions, authenticators, consents, federation links, containment; Workloads | the kernel through the Identity Control API, and the Identity Control API |
| Applications | Registrations, their keys, owners, changes and drift | the Identity Control API |
| Governance | Approvals: registration changes and registration requests waiting for a provider | the Identity Control API |
| Monitoring | Reconciler findings and runs, privileged-administration events | the Identity Control API |

A group is not shown before it has a page, because a link to nothing is a dead end. A page belongs to
the group of the object it acts on: a Principal's sessions are under Identities, not under a
"Keycloak" group.

**Tradeoff.** Grouping by backend would say which system to blame when a page fails. That is an
operator's concern, and the problem detail and the correlation identifier already carry it.
Grouping by object costs one decision per new page, which this table records.

| Ref | Source |
| :-- | :-- |
| R1 | Nielsen Norman Group, *5 Tips for Avoiding Confusing Category Names*, <https://www.nngroup.com/articles/category-names-suck/>, accessed 2026-10-03 |
| R2 | Nielsen Norman Group, *Intranet Information Architecture (IA) Methods*, <https://www.nngroup.com/articles/intranet-ia-methods/>, accessed 2026-10-03 |
| R3 | Microsoft, *Microsoft Entra admin center*, <https://learn.microsoft.com/en-us/entra/fundamentals/entra-admin-center>, accessed 2026-10-03: Entra ID covers "users, groups, devices, applications, roles, and authentication methods" |
| R4 | Microsoft, *My Account portal for work or school accounts*, <https://support.microsoft.com/en-us/account-billing/my-account-portal-for-work-or-school-accounts-eab41bfe-3b9e-441e-82be-1f6e568d65fd>, accessed 2026-10-03: "The My Account portal helps you to manage your work or school account by setting up and managing your security info, managing your devices" |

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
POST  /api/v1/principals/{principal_id}:suspend
POST  /api/v1/principals/{principal_id}:restore
POST  /api/v1/principals/{principal_id}/sessions:terminate-all
POST  /api/v1/principals/{principal_id}/authenticators/{id}:revoke
```

`GET …/events` follows when the Audit API exists. Until then `TDD-identity-control-005` keeps the
evidence in its insert-only `identity.privileged_access`, and the `EvidencePanel` is absent rather
than empty.

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
    suspend           refuse
    restore           refuse
    revoke own last authenticator   refuse
    terminate own sessions          permit, through self-service
```

An administrator cannot suspend themselves, and more importantly cannot restore
themselves. Permitting self-restoration would make suspension advisory for anyone holding
the administrative role, which is precisely the population it must apply to.

Self-service actions remain available through `TDD-identity-experience-002`. The refusal
here is about acting on oneself *as an administrator*, where the four-eyes expectation
applies.

### Containment Is Reversible First

| Action | Reversible | Confirmation |
| :-- | :-- | :-- |
| Terminate sessions | The subject signs in again | Reason |
| Suspend | Restore re-enables sign-in; no session comes back | Reason, and the effect stated plainly: sign-in stops, Memberships and ownerships are kept, a token already issued lives out its lifetime |
| Revoke an authenticator | The subject re-enrolls, if another factor remains | Reason, and the remaining factor count shown |
| Retire a Principal | **No** | Reason, typed confirmation of the identifier, and the count of Memberships that end |

Suspension disables rather than deletes, on the same reasoning as the reconciler in
`TDD-identity-control-001`: a false positive caused by a mistaken administrator is
recoverable, and deletion of a Principal is not. It is not the reconciler's `quarantined`, which
no administrator sets or lifts (`TDD-identity-control-005` §Containment Is Reversible). A
quarantined Principal is shown as such, with no containment action offered.

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
GET   /api/v1/registrations:expiring-keys
POST  /api/v1/registrations:reconcile            a sweep; with findings and a reason, apply
POST  /api/v1/registrations/{registration_id}/drift-exceptions
GET   /api/v1/registrations/{registration_id}/drift-exceptions
POST  /api/v1/registrations/{registration_id}:suspend
POST  /api/v1/registrations/{registration_id}:restore
POST  /api/v1/registrations/{registration_id}:retire
GET   /api/v1/registrations/{registration_id}/keys
POST  /api/v1/registrations/{registration_id}/keys
POST  /api/v1/registrations/{registration_id}/keys/{key_id}:revoke
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
sweep will not settle on its own. It also counts the Keycloak clients no registration
describes (`unmanaged`), which an operator adopts or deletes; such a finding names no
registration, so it is counted beside no client. Every outcome is a word and a glyph,
never a colour alone.

**Unmanaged clients.** Below the summary, the page lists each open `unmanaged` finding: the
client's `clientId`, whether it is still enabled, the Keycloak user its latest admin event
names, when that event happened, and when the reconciler first found it. A count tells an
operator that something is wrong; the list tells them which client, and whom to ask. The
section is shown only while one is open. It names the two ways out and offers neither:

- **Adopt it**, through `POST /v1/registrations:adopt` on the Identity Control API, sent
  first with `dry_run` to read what the adoption would converge (`TDD-identity-control-003`).
- **Delete it** in the Admin Console, when nothing depends on it.

Either one converges the finding on the next sweep, and the list drops it then.

**Keys about to expire.** Below the unmanaged clients, the page lists every client the API reports
in its key expiry warning (`TDD-identity-control-003` §Key Expiry Warnings): an active keyed client
whose key ends within 14 days with no successor, within 3 days, or which holds no key the kernel
accepts. Each row names the client, linked to its page, the severity as a word and a glyph, the key's
`kid`, and when it ends, with the days left. A client that cannot authenticate says so. The section
is shown only while one is reported, and its remedy is the client's own key rotation, which the
Developer Console offers (`TDD-identity-experience-004`); this page reads only.

**Adoption has no screen, by decision.** An adoption states the registration's profile,
audience class, application authority and reference, and which repairable differences it
converges, and its dry run answers with a diff an operator reads before committing. It is
rare: the bootstrap clients an estate had before identity-control, once each
(`ADR-IAM-001 §5.12`). A form for it would collect every field the API already validates and
add a second path to an operation that runs a handful of times per estate. Deleting is the
Admin Console's, because a client no registration describes has no registration to retire.
The list stays read-only.

**One registration.** A registration's page shows it as desired state records it,
and every finding for it, newest first. Findings that have converged are included,
because a repaired console change is the evidence it happened. A converged finding
shows how long the change lasted, from the admin event's time to convergence, which is
the measure the drift proof reports.

**Client keys.** A confidential or workload registration's page lists its keys, newest first: the
`kid`, the state as a word, the thumbprint the team compares with the key it holds, when it was
registered and when it expires, a retiring key's remaining overlap until its automatic removal, and
a revoked key's reason. It offers the two key commands of `TDD-identity-experience-004` §Rotation,
behaving as that design's `ClientKeyPanel` does, on behalf of the team that holds the private key:

- **Rotate**, while the registration is active and no key is retiring, since the API allows one
  overlap at a time. The next public key is pasted as a JWK, refused before sending when it carries
  a private member, is not RSA or is not for PS256 signatures, and its thumbprint is shown once
  registered. The console never generates a key pair. The API answers 200 for a key that already is
  the active one, which the page reports as already rotated, so a retry after a lost answer is not
  an error.
- **Revoke**, for an active or retiring key, with a reason sent as `X-Administrative-Reason`. When the
  key is the client's last accepted one, the form says the client stops authenticating until a new
  key is registered: a leaked key is contained that way, on purpose.

A registration's owners rotate and revoke its keys themselves, in the Developer Console
(`ADR-IAM-003`, `TDD-identity-experience-004` §Ownership). This page is the provider's path for a
registration whose owners cannot act. Both are the same panel, with the record and the lifecycle
controls, from `packages/app-core`, so the two applications cannot drift apart in what a key
command checks before it is sent.

**Drift exceptions.** The same page lists the registration's drift exceptions, newest
first. Each row shows the field class, the Keycloak user it names, the reason, the
granting Principal, and when it ends. Expired exceptions stay listed, because each is the
record of why a `sanctioned` change was left in place. Each row says whether the
exception is in force, judged against the moment the list was read so every row uses the
same clock. The list is read again after an exception is granted. It is shown for any
registration, and the grant form below it only for an `active` one.

**Actions.** Six commands, each carrying the session's CSRF token. None is retried
behind the operator's back. The page never offers an action the API would refuse.

| Action | Offered for | Collected before submission |
| :-- | :-- | :-- |
| Run a sweep now | always | nothing: it applies only what a scheduled sweep would |
| Apply the registered state | one open `blocked`, `unattributed` or `missing` finding of an `active` registration | a reason, sent as `X-Administrative-Reason` and recorded on the finding |
| Grant a drift exception | an `active` registration | the field class (`redirect_uris` or `token_lifespan`), the Keycloak user ID who will make the change, a duration of 1, 4, 8 or 24 hours, and a reason |
| Suspend | an `active` registration that is neither a resource nor a workload's | a reason, and the effect stated: the client stops getting tokens, its sessions end, and a restore makes its users sign in again |
| Restore | a `suspended` registration that is not a workload's | a reason, and the effect stated: the registered redirect URIs and keys are written back before the client is enabled |
| Retire | a `suspended` registration that is not a workload's, or an `active` resource | a reason, the `client_key` typed to confirm it, and the effect stated: the kernel client is deleted and cannot be restored |

**The lifecycle is the registration's, and follows `ADR-IAM-001 §5.13`.** A suspension is
reversible and a retirement is not, so a retirement is offered only after a suspension,
except for a resource, which holds no credential and is never suspended. It asks for the
`client_key` typed out, as retiring a Principal asks for its identifier: a click cannot
delete a client. A workload's client is stopped through its workload, from the Workloads
page (§Workloads), and the registration page offers it nothing. A resource that other registrations name in their audience is refused by the
API, and the refusal names them, which the page shows as the API's sentence. Apply is not
offered on a suspended registration, because the API refuses it there: the restore is what
writes its registered state back.

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

### Change Approval

A production registration's redirect URI change waits until a provider other than its proposer
approves it (`ADR-IAM-003 §5.2`, `TDD-identity-control-003` §Registration Changes). The portal is
where a provider does that.

```text
approval queue (GET /v1/registrations:changes), oldest first:
    each change: its client, linked to its registration; the redirect URIs before and after;
        who proposed it, why, and how long it has waited
    approve or reject, each with a reason, for a change the signed-in provider did not propose
    a change the provider proposed shows that another provider decides it, and offers nothing
    a superseded change is reported as such: the registration moved since, and it is proposed again

registration page:
    the same changes panel the Developer Console shows, with approve and reject added

registration requests (GET /v1/registration-requests), on the same page, oldest first:
    each request: its client_key, profile, audience class, lifetime class, redirect URIs and
        audience as the proposer submitted them; the owners it names; who proposed it, why, and
        how long it has waited
    approve or reject, each with a reason, for a request the signed-in provider did not propose;
        an approval links to the registration it created
```

A production registration is created only by approval (`ADR-IAM-003 §5.3`,
`TDD-identity-control-003` §Registration Requests), and the approver reads the document the API
stored, which is what it registers.

The before and after are the sets the API recorded when the change was proposed, not the
registration as it is now, so the approver decides what the proposer saw. Hiding approve on one's
own proposal is a courtesy: the API refuses it, and so does the database.

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

**Creating a person.** Creation takes a username and an optional email. The console shows the
`principal_id` the API issued, and that Keycloak asks the person to set a password at first
sign-in: identity-control creates the user with a required action and never holds a credential,
so nothing here collects one. A workload is not created here. identity-control refuses a
workload on this path, because a workload's Keycloak user is its client's service-account user
(§Workloads). The request
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

### Application Developers

The Principals page lists the application developer grants (`ADR-IAM-003 §5.3`,
`TDD-identity-control-003` §Application Developers), newest first, each active or revoked, with who
granted it and why. A provider grants the standing to a person by `principal_id`, with a reason,
and revokes an active grant with a reason. The API refuses a workload, an inactive Principal and a
second grant, and the page shows its sentence. A Principal search does not exist yet
(`TDD-identity-control-005`), so the person is named by identifier.

### Workloads

What identity-control offers for workloads comes from `TDD-identity-control-004`:

```text
POST  /api/v1/workloads                              Idempotency-Key
GET   /api/v1/workloads/{principal_id}
POST  /api/v1/workloads/{principal_id}:reassign      X-Administrative-Reason
POST  /api/v1/workloads/{principal_id}:suspend       X-Administrative-Reason
POST  /api/v1/workloads/{principal_id}:restore       X-Administrative-Reason
POST  /api/v1/workloads/{principal_id}:retire        X-Administrative-Reason
```

**Creating a workload.** Creation takes a name, a purpose, the type (service, job or connector),
the accountable owner's `principal_id`, an optional team, the `client_key` it authenticates as,
the Application it belongs to, an optional audience, and the workload's public key as a JWK. The
workload's team generates the key pair and keeps the private key; the console never accepts,
displays or stores one. A pasted JWK carrying any private member is refused before anything is
sent, with a message that the key is exposed and must be replaced, as the developer console
treats a client key (`TDD-identity-experience-004`). The size of the modulus and the thumbprint
are identity-control's to check. An agent is not offered: identity-control refuses one until
bounded delegation is built. The request carries an Idempotency-Key, kept per distinct request as
for a Principal. The console shows the `principal_id` the API issued and the `client_key` the
workload authenticates as.

**Finding and reassigning a workload.** A workload is found by its `principal_id`. There is no
list of every workload, for the reason there is none of every Principal: a directory of machine
credentials is what an attacker reads first. The workload shows its state, `client_key`, type,
owner, team, when its owner was recorded, and when it was created. An active or orphaned workload
can be reassigned to a new owner with a reason, sent as `X-Administrative-Reason`. The console
refuses the current owner before sending; whether the new owner is an active person is
identity-control's to decide, and its refusal is shown attributed to it.

**Suspending, restoring and retiring a workload.** A workload stops through its own page, never its
registration's: its client and its Principal stop together (`TDD-identity-control-004`
§Suspension, Restoration, and Retirement). The page offers exactly what the API accepts for the
workload's state:

| State | Offered | Collected, and the effect stated |
| :-- | :-- | :-- |
| `active`, `orphaned` | Suspend | a reason; the client is disabled, the next token exchange fails, and a token already issued expires within nine minutes |
| `suspended` | Restore | a reason; the owner must still be an active person, and the registered keys are written back before the client is enabled |
| `suspended` | Retire | a reason and the `client_key` typed to confirm; the client is deleted and the Principal retired, and neither can be undone |
| `pending`, `retired` | nothing | — |

A retirement is offered only after a suspension, as for a registration. A restore refused because
the owner has left is shown with the API's sentence, which says to reassign first; the console does
not reassign on the operator's behalf. After any action the workload is read again.

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

- An administrator cannot suspend themselves.
- An administrator cannot restore themselves from a suspension.
- Self session termination remains available through self-service.

### Containment

- Suspension disables and does not delete; restoration re-enables.
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
- Suspend is offered for an active confidential or public client, restore and retire for a
  suspended one, retire for an active resource, and nothing for a workload's client or a
  retired registration.
- Each lifecycle action requires a reason and sends it as `X-Administrative-Reason` with the
  CSRF token; a retirement also requires the `client_key` typed exactly.
- Apply is not offered for a finding of a suspended registration.
- A workload offers suspend when active or orphaned, restore and retire when suspended, and nothing
  when pending or retired. Each action sends the reason as `X-Administrative-Reason` with the CSRF
  token; a retirement also requires the `client_key` typed exactly. The workload is read again
  after the action.
- The drift summary counts unmanaged clients, and an unmanaged finding is counted beside no
  registration.
- Each open unmanaged finding is listed with its `clientId`, whether it is enabled, the Keycloak
  user its admin event names (or "Unknown"), and its times; a converged one is not listed, and
  the section is absent while none is open.
- The unmanaged list offers no adoption and no deletion: it names the adoption route and the
  Admin Console, and sends nothing.
- The `client_keys` and `suspension` field classes and the `unmanaged` finding class are shown
  as words.
- A keyed registration lists its keys with state, thumbprint and dates, and a retiring key's time
  left. Rotation is offered only while the registration is active and no key is retiring; a pasted
  private key is refused before anything is sent; a 200 is reported as already rotated. Revocation
  requires a reason, and warns when the key is the last accepted one.
- Each client the key expiry warning reports is listed with its severity, `kid` and end, most urgent
  first as the API orders them, linked to its registration; the section is absent while none is
  reported, and it sends nothing.

### Change Approval

- The queue lists the open changes oldest first, each with its before and after and its age.
- Approve and reject send the reason; on one's own proposal neither is offered.
- An approval answered as superseded says the registration moved since, and nothing was applied.
- A registration's page shows its changes and decides them as the queue does.
- Registration requests are listed with their document and owners; approving one links to the
  registration it created, and neither decision is offered on one's own request.

### Principals

- The application developer grants are listed newest first. A grant and a revocation each send
  their reason, and a refusal shows the API's sentence.
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

The self-restoration refusal is the one control that would be easy to omit and would quietly
void suspension. An administrator who can restore themselves cannot be contained by the
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
| Suspension without a subsequent restoration or retirement | 30 days | — |
| Self-action refusal | any occurrence | — |

A self-action refusal is worth surfacing even though it worked. It means an
administrator attempted to act on themselves through the administrative path, and the
reason matters.

Runbooks required before production: suspected directory enumeration, suspension
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
| Depends on | `TDD-identity-control-003` - registrations, their findings, the reconciler's runs, and their suspension, restoration, and retirement |
| Governed by | ADR-IAM-001 §5.13 — a registration stops by a suspension, and is removed only by a retirement after one |
| Depends on | `TDD-identity-control-001` - Principal creation, dangling mappings, and relink |
