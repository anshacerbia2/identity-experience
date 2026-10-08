// Protocol client registrations and their drift, as the Identity Control API reports them
// (TDD-identity-control-003 §API / Interface). This module is a read model: the API is the
// authority, and nothing here decides anything it would refuse.

export type RegistrationState = 'pending' | 'active' | 'suspended' | 'retired';

export const registrationStates: readonly RegistrationState[] = ['pending', 'active', 'suspended', 'retired'];

export const isRegistrationState = (value: unknown): value is RegistrationState =>
  typeof value === 'string' && (registrationStates as readonly string[]).includes(value);

export interface Registration {
  readonly registration_id: string;
  readonly realm: string;
  readonly client_key: string;
  readonly profile: 'confidential' | 'public' | 'workload' | 'resource';
  readonly audience_class: string;
  readonly application_authority: string;
  readonly application_ref: string;
  readonly registered_by: string;
  readonly signing_algorithm: string;
  readonly lifetime_class?: string;
  readonly audience: readonly string[];
  readonly redirect_uris: readonly string[];
  readonly access_token_lifespan?: number;
  // Where the kernel posts a confidential client's logout tokens; absent for a client the kernel
  // cannot reach (ADR-IAM-009, TDD-identity-control-003 1.37.0).
  readonly backchannel_logout_uri?: string;
  readonly state: RegistrationState;
  readonly version: number;
  readonly created_at: string;
}

export interface RegistrationPage {
  readonly registrations: readonly Registration[];
  readonly next: string | null;
}

export type FindingClass =
  'repaired' | 'blocked' | 'sanctioned' | 'unattributed' | 'missing' | 'recreated' | 'unmanaged';

export interface Finding {
  readonly finding_id: string;
  // Null for an unmanaged finding: a Keycloak client no registration describes.
  readonly registration_id: string | null;
  readonly client_key: string;
  readonly field_class?: string;
  readonly finding_class: FindingClass;
  readonly desired: unknown;
  readonly observed: unknown;
  readonly actor?: string;
  readonly changed_at: string | null;
  readonly detected_at: string;
  readonly converged_at: string | null;
}

export interface ReconcileRun {
  readonly run_id: string;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly outcome?: 'converged' | 'drift' | 'unresolved';
  readonly attribution: boolean | null;
  readonly findings: number;
}

export interface DriftStatus {
  readonly last_run: ReconcileRun | null;
  readonly last_run_findings: readonly Finding[] | null;
  readonly findings: readonly Finding[] | null;
}

// How much attention a finding asks for. A finding the sweep settled on its own (repaired,
// recreated by an operator, sanctioned by an exception) is information; one it refused to settle
// is a warning; a client that is gone is a danger.
export type Attention = 'info' | 'success' | 'warning' | 'danger';

export const findingAttention: Readonly<Record<FindingClass, Attention>> = {
  repaired: 'success',
  recreated: 'success',
  sanctioned: 'info',
  blocked: 'warning',
  unattributed: 'warning',
  missing: 'danger',
  unmanaged: 'danger',
};

// Only these an operator may settle by applying desired state (TDD-identity-control-003): the
// sweep refuses to do it on its own.
export const needsOperator = (finding: Finding): boolean =>
  finding.converged_at === null &&
  (finding.finding_class === 'blocked' ||
    finding.finding_class === 'unattributed' ||
    finding.finding_class === 'missing');

// The field classes a drift exception may cover, and the longest it may last: what the API
// accepts (TDD-identity-control-003 §Drift Reconciliation). The console offers nothing else.
export const exceptionFields = ['redirect_uris', 'token_lifespan'] as const;
export type ExceptionField = (typeof exceptionFields)[number];
export const exceptionHours = [1, 4, 8, 24] as const;

export interface DriftException {
  readonly exception_id: string;
  readonly registration_id: string;
  readonly field_class: ExceptionField;
  readonly actor: string;
  readonly reason: string;
  readonly granted_by: string;
  readonly granted_at: string;
  readonly expires_at: string;
}

// exceptionInForce is whether a drift exception still covers a console change at the given time.
// The API lists expired exceptions too, as the record of why a change was left in place.
export const exceptionInForce = (exception: DriftException, now: number): boolean =>
  Date.parse(exception.expires_at) > now;

// openFindingsByRegistration counts every finding that has not converged, per registration. An
// unmanaged finding names no registration, so it is counted beside none.
export function openFindingsByRegistration(findings: readonly Finding[] | null): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const finding of findings ?? []) {
    if (finding.converged_at === null && finding.registration_id !== null) {
      counts.set(finding.registration_id, (counts.get(finding.registration_id) ?? 0) + 1);
    }
  }
  return counts;
}

// unmanagedFindings are the open findings for Keycloak clients no registration describes, which an
// operator adopts or deletes.
export const unmanagedFindings = (findings: readonly Finding[] | null): readonly Finding[] =>
  (findings ?? []).filter(
    (finding) => finding.converged_at === null && finding.finding_class === 'unmanaged',
  );

export const unmanagedClients = (findings: readonly Finding[] | null): number =>
  unmanagedFindings(findings).length;

// unmanagedEnabled is whether the reconciler last saw an unmanaged client enabled, from what its
// finding observed; null when the finding does not say.
export function unmanagedEnabled(finding: Finding): boolean | null {
  const observed = finding.observed;
  if (typeof observed === 'object' && observed !== null && 'enabled' in observed) {
    const enabled = (observed as { readonly enabled: unknown }).enabled;
    return typeof enabled === 'boolean' ? enabled : null;
  }
  return null;
}

// The lifecycle (ADR-IAM-001 §5.13, TDD-identity-control-003 §Suspension, Restoration, and
// Retirement). A registration is suspended, then restored or retired; a resource, which holds no
// credential, is retired without a suspension; a workload's client is stopped through its workload.
export type LifecycleAction = 'suspend' | 'restore' | 'retire';

// lifecycleActions are the actions the API accepts for the registration as it stands, and so the
// only ones the console offers.
export function lifecycleActions(registration: Registration): readonly LifecycleAction[] {
  if (registration.profile === 'workload') {
    return [];
  }
  if (registration.profile === 'resource') {
    return registration.state === 'active' ? ['retire'] : [];
  }
  switch (registration.state) {
    case 'active':
      return ['suspend'];
    case 'suspended':
      return ['restore', 'retire'];
    default:
      return [];
  }
}

// convergenceSeconds is how long a console change lasted before the client matched desired state
// again: the drift proof's evidence. Null while it has not converged, or when the change's time is
// unknown.
export function convergenceSeconds(finding: Finding): number | null {
  if (finding.converged_at === null || finding.changed_at === null) {
    return null;
  }
  return Math.max(0, Math.round((Date.parse(finding.converged_at) - Date.parse(finding.changed_at)) / 1000));
}

// The key expiry warning (TDD-identity-control-003 §Key Expiry Warnings): an active keyed client whose
// key ends within 14 days with no successor, within 3, or which holds no key the kernel accepts.
export type KeyExpirySeverity = 'no_key' | 'critical' | 'warning';

export interface ExpiringKey {
  readonly registration_id: string;
  readonly client_key: string;
  readonly profile: Registration['profile'];
  readonly severity: KeyExpirySeverity;
  readonly key_id: string | null;
  readonly kid?: string;
  readonly expires_at: string | null;
}

export interface ExpiringKeys {
  readonly warning_days: number;
  readonly critical_days: number;
  readonly registrations: readonly ExpiringKey[];
}

export const keyExpiryAttention: Readonly<Record<KeyExpirySeverity, Attention>> = {
  no_key: 'danger',
  critical: 'danger',
  warning: 'warning',
};

// daysLeft is whole days until the key ends, rounded down, and never below zero: a key that ends in
// six hours has zero days left, which is what an operator needs to read.
export function daysLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 86_400_000));
}

// A registered client key (TDD-identity-control-003 §Client Key Records). The public key only: the
// client keeps its private key, and nothing secret was ever submitted.
export type KeyState = 'active' | 'retiring' | 'revoked';

export interface ClientKey {
  readonly key_id: string;
  readonly registration_id: string;
  readonly kid: string;
  readonly thumbprint: string;
  readonly state: KeyState;
  readonly registered_by: string;
  readonly registered_at: string;
  readonly expires_at: string;
  readonly retiring_at: string | null;
  readonly revoked_at: string | null;
  readonly revoked_by: string | null;
  readonly revocation_reason?: string;
}

// keyed reports whether a registration authenticates with a registered key.
export const keyed = (registration: Pick<Registration, 'profile'>): boolean =>
  registration.profile === 'confidential' || registration.profile === 'workload';

// rotationOffered is what the API accepts: an active registration, and no key still retiring, since
// a registration holds one overlap at a time.
export const rotationOffered = (
  registration: Pick<Registration, 'state'>,
  keys: readonly ClientKey[],
): boolean => registration.state === 'active' && !keys.some((key) => key.state === 'retiring');

// lastAccepted reports whether revoking this key leaves the client no key the kernel accepts.
export const lastAccepted = (keys: readonly ClientKey[], keyId: string): boolean =>
  keys.filter((key) => key.state !== 'revoked' && key.key_id !== keyId).length === 0;

// hoursLeft is the time left until a moment, in whole hours, never below zero: a retiring key's
// overlap shown as what is left of it.
export function hoursLeft(until: string, now: number): number {
  return Math.max(0, Math.floor((Date.parse(until) - now) / 3_600_000));
}

// An ownership of a registration (ADR-IAM-003, TDD-identity-control-003 §Registration Ownership).
// The API returns revoked ownerships too, as the record of who held it; active is whether this one
// confers anything now: not revoked, and its Principal still an active person.
export interface Owner {
  readonly ownership_id: string;
  readonly registration_id: string;
  readonly principal_id: string;
  readonly granted_by: string;
  readonly grant_reason: string;
  readonly granted_at: string;
  readonly revoked_at: string | null;
  readonly revoked_by: string | null;
  readonly revoke_reason?: string;
  readonly active: boolean;
}

export const activeOwners = (owners: readonly Owner[]): readonly Owner[] =>
  owners.filter((owner) => owner.active);

// ownerRevocable is whether the API accepts revoking this ownership (TDD-identity-control-003
// §Registration Ownership): one not yet revoked, except an active one in production when it would
// leave fewer than minProductionOwners active owners. An ownership that confers nothing already
// leaves the active owners as they were, so it is always revocable.
export function ownerRevocable(
  owner: Owner,
  owners: readonly Owner[],
  environment: 'production' | 'non-production',
): boolean {
  if (owner.revoked_at !== null) {
    return false;
  }
  if (!owner.active || environment !== 'production') {
    return true;
  }
  return activeOwners(owners).length - 1 >= minProductionOwners;
}

// A change to a registration's redirect URIs, its audience, or a resource's lifetime class
// (ADR-IAM-003 §5.2, §5.9, TDD-identity-control-003 §Registration Changes). The API records what it
// replaces and the version it was read at, so what an approver sees is what the proposer saw. Exactly
// one of the before/after pairs is set, by `kind`; the others are `null`, never `[]`.
export type ChangeState = 'proposed' | 'applied' | 'rejected' | 'withdrawn' | 'superseded';
export type ChangeKind = 'redirect_uris' | 'audience' | 'lifetime_class';

export interface RegistrationChange {
  readonly change_id: string;
  readonly registration_id: string;
  readonly client_key: string;
  readonly base_version: number;
  readonly kind: ChangeKind;
  readonly previous_redirect_uris: readonly string[] | null;
  readonly redirect_uris: readonly string[] | null;
  readonly previous_audience: readonly string[] | null;
  readonly audience: readonly string[] | null;
  // A lifetime_class change's before and after; null for every other kind, and absent from a change
  // an API before TDD-identity-control-003 1.37.0 recorded.
  readonly previous_lifetime_class?: string | null;
  readonly lifetime_class?: string | null;
  readonly approval_required: boolean;
  readonly proposed_by: string;
  readonly proposal_reason: string;
  readonly proposed_at: string;
  readonly state: ChangeState;
  readonly decided_by: string | null;
  readonly decision_reason?: string;
  readonly decided_at: string | null;
}

// changeValues is a change's before and after, picked by its kind: the API leaves the other kind's
// pair `null`.
export function changeValues(change: RegistrationChange): {
  readonly before: readonly string[];
  readonly after: readonly string[];
} {
  switch (change.kind) {
    case 'audience':
      return { before: change.previous_audience ?? [], after: change.audience ?? [] };
    case 'lifetime_class':
      return {
        before: change.previous_lifetime_class ? [change.previous_lifetime_class] : [],
        after: change.lifetime_class ? [change.lifetime_class] : [],
      };
    case 'redirect_uris':
      return { before: change.previous_redirect_uris ?? [], after: change.redirect_uris ?? [] };
  }
}

export type ChangeDecision = 'approve' | 'reject' | 'withdraw';

// hasRedirectUris is whether a registration's profile carries redirect URIs: a public or
// confidential client. hasAudience is whether it carries an audience: every profile but a resource,
// which is an audience itself (TDD-identity-control-003 §Registration Changes).
export const hasRedirectUris = (registration: Pick<Registration, 'profile'>): boolean =>
  registration.profile === 'public' || registration.profile === 'confidential';

export const hasAudience = (registration: Pick<Registration, 'profile'>): boolean =>
  registration.profile !== 'resource';

// hasLifetimeClass is whether a registration carries a lifetime class: a resource, whose callers
// derive their lifespan from it (STD-IAM-002 §3.3).
export const hasLifetimeClass = (registration: Pick<Registration, 'profile'>): boolean =>
  registration.profile === 'resource';

// changeKinds are the changes the API accepts for a registration as it stands: only an active one
// is changed, and only in what its profile carries. The API refuses the rest; this keeps a form
// from being offered.
export function changeKinds(registration: Pick<Registration, 'profile' | 'state'>): readonly ChangeKind[] {
  if (registration.state !== 'active') {
    return [];
  }
  return [
    ...(hasRedirectUris(registration) ? (['redirect_uris'] as const) : []),
    ...(hasAudience(registration) ? (['audience'] as const) : []),
    ...(hasLifetimeClass(registration) ? (['lifetime_class'] as const) : []),
  ];
}

// changeable is whether a registration's redirect URIs can be changed now.
export const changeable = (registration: Pick<Registration, 'profile' | 'state'>): boolean =>
  changeKinds(registration).includes('redirect_uris');

// lineEntries reads a set typed one entry per line. Blank lines and surrounding spaces are not
// entries; everything else is the API's to judge. An empty set is a set: an audience of no
// resource is a change the API accepts.
export const lineEntries = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

// redirectLines reads redirect URIs typed one per line.
export const redirectLines = lineEntries;

export interface SetDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly kept: readonly string[];
}

// setDiff is a change's before and after, as an approver reads it. Generic over the two kinds of
// set a registration change carries: redirect URIs and audience entries.
export function setDiff(before: readonly string[], after: readonly string[]): SetDiff {
  return {
    added: after.filter((value) => !before.includes(value)),
    removed: before.filter((value) => !after.includes(value)),
    kept: after.filter((value) => before.includes(value)),
  };
}

export const openChange = (changes: readonly RegistrationChange[]): RegistrationChange | undefined =>
  changes.find((change) => change.state === 'proposed');

// What the signed-in person may do with registrations beyond what it owns
// (GET /v1/registrations:standing, TDD-identity-control-003 §Application Developers).
export interface Standing {
  readonly provider: boolean;
  readonly application_developer: boolean;
  readonly environment: 'production' | 'non-production';
}

// mayRegister is whether a console offers registration: an application developer creates
// non-production registrations only (ADR-IAM-003 §5.3).
export const mayRegister = (standing: Standing): boolean =>
  standing.application_developer && standing.environment === 'non-production';

// What an application developer registers: privileged carries the provider-scope claim surface, and
// a workload is created by a provider through its own path.
export const developerProfiles = ['public', 'confidential', 'resource'] as const;
export type DeveloperProfile = (typeof developerProfiles)[number];
export const developerClasses = ['internal', 'external'] as const;
export type DeveloperClass = (typeof developerClasses)[number];

// The lifetime classes of STD-IAM-002 §3.3 and what each means: the access token lifetime and the
// revocation target, in minutes (TDD-identity-experience-004 §Lifetime Class as an Interval).
export const lifetimeClasses = ['L0', 'L1', 'L2', 'L3'] as const;
export type LifetimeClass = (typeof lifetimeClasses)[number];
export const isLifetimeClass = (value: unknown): value is LifetimeClass =>
  typeof value === 'string' && (lifetimeClasses as readonly string[]).includes(value);
export const classMinutes: Readonly<Record<LifetimeClass, { token: number; revocation: number }>> = {
  L0: { token: 4, revocation: 5 },
  L1: { token: 9, revocation: 10 },
  L2: { token: 15, revocation: 16 },
  L3: { token: 9, revocation: 10 },
};

// The lifetime classes a developer's resource may carry. L3 is for workload audiences, which a
// developer does not register.
export const developerLifetimeClasses = ['L0', 'L1', 'L2'] as const;
export type DeveloperLifetimeClass = (typeof developerLifetimeClasses)[number];
export const lifetimeMinutes: Readonly<
  Record<DeveloperLifetimeClass, { token: number; revocation: number }>
> = classMinutes;

export interface RegisterRequest {
  readonly client_key: string;
  readonly profile: DeveloperProfile;
  readonly audience_class: DeveloperClass;
  readonly application_ref: string;
  readonly lifetime_class?: DeveloperLifetimeClass;
  readonly audience?: readonly string[];
  readonly redirect_uris?: readonly string[];
  readonly public_key?: unknown;
}

// A request for a production registration (ADR-IAM-003 §5.3, TDD-identity-control-003
// §Registration Requests): the document as POST /v1/registrations takes it, the owners it names,
// and its decision. An approval names the registration it created.
export type RequestState = 'proposed' | 'approved' | 'rejected' | 'withdrawn';

export interface RegistrationRequestRecord {
  readonly request_id: string;
  readonly client_key: string;
  readonly request: RegisterRequest;
  readonly owners: readonly string[];
  readonly proposed_by: string;
  readonly proposal_reason: string;
  readonly proposed_at: string;
  readonly state: RequestState;
  readonly decided_by: string | null;
  readonly decision_reason?: string;
  readonly decided_at: string | null;
  readonly registration_id: string | null;
}

// mayRequest is whether a console offers a production request: an application developer, in
// production, where it does not register directly.
export const mayRequest = (standing: Standing): boolean =>
  standing.application_developer && standing.environment === 'production';

// ownerLines reads owners typed one principal_id per line, each once.
export const ownerLines = (text: string): string[] => [...new Set(redirectLines(text))];

export const minProductionOwners = 2;
