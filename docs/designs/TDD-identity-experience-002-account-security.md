---
doc_meta:
  id: TDD-identity-experience-002
  title: Account Security — Sessions, Devices, Authenticators, and Consent
  owner: Identity Experience Team
  version: 1.7.0
  status: approved
  classification: restricted
  review_cycle_days: 90
  created_date: 2026-08-11
  last_reviewed: 2026-10-07
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

### Delivery

The account security experience is its own application, `apps/account`, built with Vite under
the base path `/account/` and served by the Identity Experience BFF beside the Admin Portal and
the Developer Console (`TDD-identity-experience-001` §Runtime). It uses the same session, CSRF
token and `/api` proxy, so a person signed in to one is signed in to all three.

**Why a separate application, not a section of the Admin Portal.**
- **The containers are already separate.** SAD-002 §4.1 lists "Account Security Experience" and
  "Identity Admin Portal" as different containers.
- **The audiences are different.** The Portal is for the few providers who act on other people.
  Account security is for every person, acting on themselves. A section of the Portal would send
  the Portal's pages and navigation to every person's browser. It would also blur in the interface
  the line the API draws between route class `self` and `providerOnly`
  (`TDD-identity-control-005` §Self-Service as Built).
- **Identity products separate these the same way.**
  - Microsoft's My Account (`myaccount.microsoft.com`) is separate from the Entra admin center.
  - Google Account (`myaccount.google.com`) is separate from the Google Admin console.
  - Okta's End-User Dashboard is separate from its Admin Console.
  - The kernel itself does this: Keycloak's Account Console is separate from its Admin Console.

The three applications share what must not differ between them through `packages/app-core`:
API access and its step-up handling, the session, the query client, preferences and the frame.
Each application's pages, navigation and message catalogue are its own. A sign-in started from
the account application returns to it, and one that does not complete lands on `/account/` with
its marker.

### As Built: Sessions and Authenticators (1.2.0)

Built on `TDD-identity-control-005` slice 3a. Consents and recovery are not built yet, and the page
shows neither. Enrollment followed in 1.3.0 (below):
- Consents wait for the API's slice 3b.
- Recovery waits for the kernel's recovery pages.

**Sessions.**
- Each row shows when the session started, when it was last used, and the applications it is signed
  in to. The session the page was loaded from is marked "This browser".
- The kernel holds no device class or location, so neither is shown (`TDD-identity-control-005`
  §Read Authorization and Disclosure). Neither is an address, a user agent or an identifier
  (§Device Presentation).
- **Ending one session.** The row is ended at once, with no reason asked. The page says the
  device's access ends within the access token's lifetime, at most four minutes, and not instantly
  (`TDD-identity-control-005` 2.3.1).
- **Ending every session.** The page asks for an explicit confirmation that this browser is signed
  out too (§Terminating the Current Session).
  - On success the application calls `POST /auth/logout`, which ends the BFF session, and shows
    the signed-out page.
  - Keycloak's session is already gone at that point, so the BFF's logout call to the kernel is
    expected to fail. `TDD-identity-experience-001` already ends the BFF session regardless.

**Authenticators.**
- Each row shows type, label and enrollment date.
- **Remove** is offered on every row. A step-up challenge offers a fresh sign-in, as everywhere
  (`TDD-identity-experience-001` §Step-Up).
- A refusal is the API's (`last_authenticator`). The page renders it as "This is your last way to
  sign in", and does not compute it beforehand (§The Last Authenticator Guard). Since 1.7.0 it also
  says how to replace it: add another one first, then remove this one. The ways to add one are on the
  same page (below), so replacement is enrollment followed by removal, and needs no control of its own.

**Enrolling an authenticator app (1.3.0).** Built on `TDD-identity-control-005` slice 4a.
- **Asking.** "Add an authenticator app" asks the API to authorize the enrollment
  (`POST /api/v1/me/authenticators:enroll`, `{"type":"totp"}`).
- **Too old an authentication.** The API asks for the level binding requires: `aal2` once the person
  holds a second factor, `aal1` before, and recent. The page offers the step-up sign-in, as every
  challenge does. The person presses the button again after it.
- **Authorized.** The API names the kernel action, `CONFIGURE_TOTP`. The page navigates to the BFF's
  sign-in with that action, returning to `/account/`. The kernel's own page shows the QR code and
  takes the first code. This application never sees the secret (§Data Model).
- **Back on the page.** It says whether the kernel reports the action as done or cancelled, and reads
  the authenticators again.

**Adding a security key (1.4.0).** Built on `TDD-identity-control-005` slice 4b (2.7.0).
- **Asking.** "Add a security key" asks the API to authorize `{"type":"webauthn"}`. The level and the
  step-up are the same as for an authenticator app.
- **Authorized.** The API names `webauthn-register`. The page navigates to the BFF's sign-in with
  that action. The kernel's own page asks the browser to create the credential and names it. This
  application never sees the key.
- **Back on the page.** The outcome is said the same way. The kernel's `kc_action_status` does not say
  which action ran, so the sentence names neither: "The authenticator is added."
- **What it is used for.** A key added here is a second factor beside the password, which the
  kernel's level 2 accepts in place of a code (TDD-identity-kernel-001 1.11.0). A passkey that
  replaces the password is not offered.

**Recovery codes (1.5.0).** Built on `ADR-IAM-005` and `TDD-identity-control-005` 2.8.0.
- **Where they come from.** The kernel issues a set of codes with the first authenticator app.
  "Get new recovery codes" asks the API to authorize `{"type":"recovery-codes"}`. The API names
  `CONFIGURE_RECOVERY_AUTHN_CODES`, and the kernel's page shows a new set that replaces the old one.
  This application never sees a code.
- **The row.** A set is listed with the authenticators, with how many of its codes remain:
  "11 of 12 codes left", from the API's `remaining_codes` and `total_codes`.
- **A used set.** When fewer codes remain than the set began with, the person has signed in with
  one. The page says so above the list, and asks for a new set and, if a factor was lost, another
  authenticator (`ADR-IAM-005 §5.4`). The kernel replaces a used code only when the whole set is
  used, so this sentence is the prompt to replace it sooner.
- **Removing a set** is offered like any row, and the API never refuses it for the floor: codes are
  recovery, not a factor a provider keeps.

This is the enrollment step §The Last Authenticator Guard makes the safe order: enroll a
replacement, then remove the old one.

**Where you are told (1.6.0).** Built on `ADR-IAM-007 §5.2` and `TDD-identity-control-008` 1.2.0.
- **The list.** The person's notification addresses, in use or waiting for their code. Every change
  to the account is told to each address in use. While only one is in use, the page asks for a
  second (NIST SP 800-63B-4 §4.6: "CSPs SHALL support at least two notification addresses").
- **Adding.** An email and an Idempotency-Key. The API asks for a recent `aal2` with a step-up
  challenge, which the page answers with the same "Sign in again" link a removal shows. The new
  address is pending, and the API sends its code to that address alone.
- **Proving.** The code is typed next to the pending address. No step-up is asked: the code is the
  proof, and the person may read it on another device. A wrong or expired code is the API's
  refusal, shown as it is.
- **Removing.** Each address has Remove. It asks for a recent `aal2`. The API tells every address
  held before, the removed one included, and refuses to remove the last one in use. The page shows
  that refusal rather than deciding it.
- **What this application never sees** is the code itself: it is typed by the person and checked by
  the API.

**Commands.** Every command carries an Idempotency-Key kept per distinct request, and no reason
and no version: the API takes neither for a person's own commands. A `202` is followed at
`GET /api/v1/me/security-operations/{operation_id}`.

**Getting there.** The shared frame's account menu links to `/account/` from the Portal and the
console. The account application links back to neither, because most of the people who use it
hold no role there.

## Data Model

This repository holds no security state. Its client model is a read projection of API
responses, discarded on sign-out. Sessions, authenticators, and consents are held by the
kernel and read through the Identity Control API.

## API / Interface

```text
GET   /api/v1/me/sessions
POST  /api/v1/me/sessions/{security_ref}:terminate
POST  /api/v1/me/sessions:terminate-all
GET   /api/v1/me/authenticators
POST  /api/v1/me/authenticators:enroll
POST  /api/v1/me/authenticators/{security_ref}:remove
GET   /api/v1/me/consents
POST  /api/v1/me/consents/{consent_id}:withdraw
GET   /api/v1/me/security-operations/{operation_id}
GET   /api/v1/me/notification-addresses
POST  /api/v1/me/notification-addresses
POST  /api/v1/me/notification-addresses/{address_id}:verify
POST  /api/v1/me/notification-addresses/{address_id}:remove
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
- The last-authenticator refusal says how to replace it, and the ways to add one are offered beside
  it (1.7.0, `apps/account/src/features/security/SecurityPage.test.tsx`).

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
