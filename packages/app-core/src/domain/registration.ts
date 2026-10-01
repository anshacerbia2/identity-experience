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

// A change to a registration's redirect URIs (ADR-IAM-003 §5.2, TDD-identity-control-003
// §Registration Changes). The API records the set it replaces and the version it was read at, so
// what an approver sees is what the proposer saw.
export type ChangeState = 'proposed' | 'applied' | 'rejected' | 'withdrawn' | 'superseded';

export interface RegistrationChange {
  readonly change_id: string;
  readonly registration_id: string;
  readonly client_key: string;
  readonly base_version: number;
  readonly previous_redirect_uris: readonly string[];
  readonly redirect_uris: readonly string[];
  readonly approval_required: boolean;
  readonly proposed_by: string;
  readonly proposal_reason: string;
  readonly proposed_at: string;
  readonly state: ChangeState;
  readonly decided_by: string | null;
  readonly decision_reason?: string;
  readonly decided_at: string | null;
}

export type ChangeDecision = 'approve' | 'reject' | 'withdraw';

// changeable is whether a registration's redirect URIs can be changed now: only an active public or
// confidential client has them. The API refuses the rest; this keeps the form from being offered.
export const changeable = (registration: Pick<Registration, 'profile' | 'state'>): boolean =>
  registration.state === 'active' &&
  (registration.profile === 'public' || registration.profile === 'confidential');

// redirectLines reads a set typed one URI per line. Blank lines and surrounding spaces are not URIs;
// everything else is the API's to judge.
export const redirectLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

export interface RedirectDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly kept: readonly string[];
}

// redirectDiff is a change's before and after, as an approver reads it.
export function redirectDiff(before: readonly string[], after: readonly string[]): RedirectDiff {
  return {
    added: after.filter((uri) => !before.includes(uri)),
    removed: before.filter((uri) => !after.includes(uri)),
    kept: after.filter((uri) => before.includes(uri)),
  };
}

export const openChange = (changes: readonly RegistrationChange[]): RegistrationChange | undefined =>
  changes.find((change) => change.state === 'proposed');
