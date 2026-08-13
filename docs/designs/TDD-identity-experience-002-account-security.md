---
doc_meta:
  id: TDD-identity-experience-002
  title: Account Security — Sessions, Devices, Authenticators, and Consent
  owner: Identity Experience Team
  version: 1.1.0
  status: approved
  classification: restricted
  review_cycle_days: 90
  created_date: 2026-08-11
  last_reviewed: 2026-08-14
  parent_sad: SAD-002
---

# Account Security — Sessions, Devices, Authenticators, and Consent

## Purpose

Specify the surfaces through which a Principal inspects and changes their own security
state: active sessions and devices, enrolled authenticators, and granted consents.

PAD-PLT-001 §6.6 requires hosted identity experiences to clearly expose session,
authenticator, consent, and security state. This design supplies that, and it supplies
the guardrails that stop the same surfaces from becoming an account-takeover tool for
whoever holds a stolen session.

## Scope

**In scope**

- Session and device inventory, and termination including the current session.
- Authenticator enrollment, replacement, and removal.
- Consent inventory and withdrawal.
- The assurance required for each change, and why it differs.
- Entry points into kernel-rendered recovery.

**Out of scope**

- The BFF session pattern — inherited unchanged from
  `TDD-identity-experience-001`.
- Credential verification, MFA ceremonies, and recovery pages, which the kernel renders
  through the theme in `identity-kernel`.
- Administration of other Principals — owned by `TDD-identity-experience-003`.

## Technical Context

Every surface here is self-service: a Principal acting on their own account. That makes
the threat model specific. The attacker is not an outsider probing an API; it is
someone who already holds a session and wants to make it permanent.

The three moves that attacker makes are the three this design constrains:

| Attacker move | Effect if unconstrained |
| :-- | :-- |
| Enroll a new authenticator | Persistent access that survives the owner's password change |
| Remove the owner's authenticators | The real owner is locked out and cannot recover |
| Terminate the owner's sessions | The owner is signed out while the attacker remains |

A session that can silently rewrite the factors that produced it is a session that
never has to be stolen twice.

## Component Design

| Component | Responsibility |
| :-- | :-- |
| `SessionInventory` | Lists active sessions and devices, terminates one or all |
| `AuthenticatorManager` | Enrollment, replacement, removal, with the last-factor guard |
| `ConsentInventory` | Lists granted consents and withdraws them |
| `RecoveryEntry` | Hands off to kernel-rendered recovery, carrying no state |

All four proxy through the BFF to the Identity Control API. None makes an authorization
decision; each renders what the API returns and refuses what the API refuses.
`TDD-identity-control-005` is the upstream contract for every route below. The BFF
removes the `/api` prefix while proxying and changes no subject, guard, or result.

## Data Model

This repository holds no security state. Its client model is a read projection of API
responses, discarded on sign-out. Sessions, authenticators, and consents are held by the
kernel and read through the Identity Control API.

## API / Interface

```text
GET   /api/v1/me/sessions
POST  /api/v1/me/sessions/{session_id}:terminate
POST  /api/v1/me/sessions:terminate-all
GET   /api/v1/me/authenticators
POST  /api/v1/me/authenticators:enroll
POST  /api/v1/me/authenticators/{authenticator_id}:remove
GET   /api/v1/me/consents
POST  /api/v1/me/consents/{consent_id}:withdraw
```

Every path is scoped to the authenticated Principal by the API, never by a parameter the
browser supplies. `/me` carries no identifier for the same reason: a path that accepts
one invites a handler that trusts it.

## Algorithms / Logic

### Assurance Per Operation

```text
read inventory                     session only
terminate one session              session only
terminate all sessions             session only
enroll an authenticator            step-up required
remove an authenticator            step-up required
withdraw consent                   session only
```

Reads and terminations need no step-up because both are safe in the attacker's hands
and harmful to block: an owner who suspects compromise must be able to terminate
sessions immediately, and requiring a factor they may have lost defeats the purpose.

Enrollment and removal require step-up because both are how a session becomes
permanent. The step-up is driven by the BFF against the requirement the API declares,
per `TDD-identity-experience-001`; this surface never decides that a factor is
sufficient.

### The Last Authenticator Guard

```text
remove(authenticator):
    if it is the only enrolled authenticator:
        refuse, and explain that a replacement must be enrolled first
    if removing it would drop assurance below the account's policy floor:
        refuse, naming the floor
```

Both refusals come from the API. This surface renders them; it does not compute them,
because a client-side guard is absent from any caller that is not this client.

Enrolling before removing is the order the interface enforces, so an owner replacing a
lost device is never momentarily without a factor.

### Terminating the Current Session

"Sign out everywhere" includes the session issuing the request. Excluding it leaves the
one session an attacker is using if the attacker pressed the button, and leaves the
owner believing they signed out everywhere when they did not.

```text
terminate-all:
    confirm explicitly that this will end this session too
    submit
    on success, destroy the BFF session and redirect to sign-in
```

### Consent Withdrawal Is Not Revocation

Withdrawing consent stops future grants to a client. It does not invalidate access
tokens already issued, which live until they expire.

The interface says so:

| State | Shown as |
| :-- | :-- |
| Withdrawn | Consent withdrawn. Existing access ends within the token lifetime shown |
| Fully ended | No further access |

This mirrors the revocation presentation rule in `TDD-organization-experience-001`, and
for the same reason. An interface that reports "access removed" the moment consent is
withdrawn teaches a user that withdrawal is instant, and the user then closes an
incident they have not finished.

### Device Presentation

Sessions are grouped by device with the metadata the kernel provides: device class,
approximate location, first and last seen, and current-session marker. The current
session is marked unambiguously, because terminating the wrong row is the most common
error on this surface.

No raw address, user agent string, or session identifier is rendered. They add nothing
a person can act on and they widen what a shoulder-surfer or a screenshot leaks.

## Configuration

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `IDENTITY_EXPERIENCE_SESSION_LIST_PAGE` | `25` | Sessions per page |
| `IDENTITY_EXPERIENCE_STEPUP_MAX_AGE` | `5m` | Recency accepted for a step-up before it is re-driven |

Session, cookie, and refresh settings are inherited from
`TDD-identity-experience-001`.

## Testing Strategy

### Assurance

- Enrollment without a recent step-up is refused.
- Removal without a recent step-up is refused.
- A step-up older than `STEPUP_MAX_AGE` is re-driven rather than accepted.
- Termination and reads succeed without step-up.

### Guards

- Removing the only enrolled authenticator is refused.
- Removing a factor that would drop assurance below the policy floor is refused, and
  the refusal names the floor.
- The refusal originates from the API, asserted by calling the API directly.

### Sessions

- `terminate-all` ends the current session and the BFF session is destroyed.
- The current session is marked unambiguously in the listing.
- Terminating another session does not affect this one.

### Consent

- Withdrawal is presented as taking effect within the token lifetime, not immediately.
- A withdrawn consent stops the next authorization request for that client.

### Disclosure

- No raw address, user agent string, or session identifier is rendered.
- No token or credential appears in any response, per the containment tests inherited
  from design 001.

## Security Notes

The threat model here is a held session rather than an outsider, which is why step-up
sits on enrollment and removal rather than on reads. Requiring a factor to look is
friction with no benefit; requiring one to change the factors is the whole control.

Terminating sessions is deliberately the cheapest action on the surface. A person who
suspects compromise should reach it in one step, and any assurance gate placed there
would be a gate they may be unable to pass precisely when they need it most.

The last-authenticator guard is computed by the API. A guard implemented only in this
client protects only this client, and the same API serves administrative tooling and
future surfaces.

## Performance Notes

Every surface is a paged read against the Identity Control API through the BFF. Nothing
here appears on an authentication or token-validation path.

## Operational Notes

| Signal | Warning | Critical |
| :-- | :-- | :-- |
| Authenticator removals per Principal per day | above baseline | — |
| Enrollment immediately followed by removal of all other factors | any occurrence | any occurrence |
| `terminate-all` rate | above baseline | sustained |

The second signal is the account-takeover pattern in one line: enroll, then remove
everything else. It is surfaced as a security finding rather than as usage data.

Runbooks required before production: suspected account takeover through authenticator
change, and locked-out Principal recovery.

## Traceability

| Relationship | Target |
| :-- | :-- |
| Parent system | SAD-002 — Scnehaux Identity Experience |
| Realizes capability | PAD-PLT-001 §6.6 — session, authenticator, and consent state clearly exposed |
| Conforms to | `TDD-identity-experience-001` — BFF session, step-up, containment |
| Conforms to | STD-IAM-001 §3.1, §3.9 — authenticator policy, browser security |
| Depends on | `TDD-identity-control-005` - every guard and refusal originates in the account-security API mediation contract |
| Depends on | `identity-kernel` — recovery and MFA ceremonies are kernel-rendered |
