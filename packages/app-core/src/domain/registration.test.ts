import { describe, expect, it } from 'vitest';

import {
  changeable,
  changeKinds,
  changeValues,
  classMinutes,
  convergenceSeconds,
  daysLeft,
  lifecycleActions,
  mayRequest,
  needsOperator,
  openFindingsByRegistration,
  ownerLines,
  redirectLines,
  setDiff,
  unmanagedClients,
  unmanagedEnabled,
  type Finding,
  type Registration,
  type RegistrationChange,
  ownerRevocable,
  type Owner,
} from './registration';

const finding = (overrides: Partial<Finding>): Finding => ({
  finding_id: 'f',
  registration_id: 'r1',
  client_key: 'web',
  finding_class: 'repaired',
  desired: null,
  observed: null,
  changed_at: null,
  detected_at: '2026-09-29T10:00:00Z',
  converged_at: null,
  ...overrides,
});

describe('registration read model', () => {
  it('counts only findings that have not converged, per registration', () => {
    const counts = openFindingsByRegistration([
      finding({ registration_id: 'r1' }),
      finding({ registration_id: 'r1' }),
      finding({ registration_id: 'r2', converged_at: '2026-09-29T10:01:00Z' }),
    ]);
    expect(counts.get('r1')).toBe(2);
    expect(counts.has('r2')).toBe(false);
    expect(openFindingsByRegistration(null).size).toBe(0);
  });

  it('measures convergence from the console change, and not before it converged', () => {
    expect(
      convergenceSeconds(
        finding({ changed_at: '2026-09-29T10:00:00Z', converged_at: '2026-09-29T10:00:42Z' }),
      ),
    ).toBe(42);
    expect(convergenceSeconds(finding({ changed_at: '2026-09-29T10:00:00Z' }))).toBeNull();
    expect(convergenceSeconds(finding({ converged_at: '2026-09-29T10:00:42Z' }))).toBeNull();
  });

  it('asks an operator only for open blocked, unattributed or missing findings', () => {
    expect(needsOperator(finding({ finding_class: 'blocked' }))).toBe(true);
    expect(needsOperator(finding({ finding_class: 'missing' }))).toBe(true);
    expect(needsOperator(finding({ finding_class: 'unattributed' }))).toBe(true);
    expect(needsOperator(finding({ finding_class: 'repaired' }))).toBe(false);
    expect(needsOperator(finding({ finding_class: 'sanctioned' }))).toBe(false);
    expect(needsOperator(finding({ finding_class: 'blocked', converged_at: '2026-09-29T10:00:00Z' }))).toBe(
      false,
    );
  });

  it('counts an unmanaged finding beside no registration, and on its own', () => {
    const unmanaged = finding({ registration_id: null, finding_class: 'unmanaged', client_key: 'stray' });
    const counts = openFindingsByRegistration([unmanaged, finding({ registration_id: 'r1' })]);
    expect([...counts.keys()]).toEqual(['r1']);
    expect(
      unmanagedClients([unmanaged, finding({}), { ...unmanaged, converged_at: '2026-09-29T10:01:00Z' }]),
    ).toBe(1);
    expect(unmanagedClients(null)).toBe(0);
    expect(needsOperator(unmanaged)).toBe(false);
  });

  it('reads whether an unmanaged client was enabled from what its finding observed', () => {
    const unmanaged = finding({ registration_id: null, finding_class: 'unmanaged' });
    expect(unmanagedEnabled({ ...unmanaged, observed: { client_id: 'stray', enabled: false } })).toBe(false);
    expect(unmanagedEnabled({ ...unmanaged, observed: { client_id: 'stray', enabled: true } })).toBe(true);
    expect(unmanagedEnabled({ ...unmanaged, observed: { client_id: 'stray' } })).toBeNull();
    expect(unmanagedEnabled({ ...unmanaged, observed: null })).toBeNull();
  });

  it('offers the lifecycle actions the API accepts for the registration as it stands', () => {
    const registration = (profile: Registration['profile'], state: Registration['state']): Registration => ({
      registration_id: 'r1',
      realm: 'scnehaux',
      client_key: 'web',
      profile,
      audience_class: 'internal',
      application_authority: 'manual',
      application_ref: 'app',
      registered_by: 'p',
      signing_algorithm: 'PS256',
      audience: [],
      redirect_uris: [],
      state,
      version: 1,
      created_at: '2026-09-29T10:00:00Z',
    });
    expect(lifecycleActions(registration('confidential', 'active'))).toEqual(['suspend']);
    expect(lifecycleActions(registration('public', 'suspended'))).toEqual(['restore', 'retire']);
    expect(lifecycleActions(registration('confidential', 'retired'))).toEqual([]);
    expect(lifecycleActions(registration('confidential', 'pending'))).toEqual([]);
    expect(lifecycleActions(registration('resource', 'active'))).toEqual(['retire']);
    expect(lifecycleActions(registration('resource', 'retired'))).toEqual([]);
    expect(lifecycleActions(registration('workload', 'active'))).toEqual([]);
    expect(lifecycleActions(registration('workload', 'suspended'))).toEqual([]);
  });
});

describe('key expiry', () => {
  it('counts whole days left, never below zero', () => {
    const now = Date.parse('2026-10-01T00:00:00Z');
    expect(daysLeft('2026-10-03T06:00:00Z', now)).toBe(2);
    expect(daysLeft('2026-10-01T06:00:00Z', now)).toBe(0);
    expect(daysLeft('2026-09-30T00:00:00Z', now)).toBe(0);
  });
});

describe('redirect URI changes', () => {
  it('reads one URI per line, ignoring blank lines and surrounding spaces', () => {
    expect(redirectLines('  https://a.example.com/cb \n\n\r\nhttps://b.example.com/cb\n')).toEqual([
      'https://a.example.com/cb',
      'https://b.example.com/cb',
    ]);
    expect(redirectLines('   \n')).toEqual([]);
  });

  it('states what a change adds, removes and keeps', () => {
    expect(setDiff(['https://a/cb', 'https://b/cb'], ['https://b/cb', 'https://c/cb'])).toEqual({
      added: ['https://c/cb'],
      removed: ['https://a/cb'],
      kept: ['https://b/cb'],
    });
  });

  it('offers a change only on an active client that has redirect URIs', () => {
    expect(changeable({ profile: 'public', state: 'active' })).toBe(true);
    expect(changeable({ profile: 'confidential', state: 'active' })).toBe(true);
    expect(changeable({ profile: 'confidential', state: 'suspended' })).toBe(false);
    expect(changeable({ profile: 'workload', state: 'active' })).toBe(false);
    expect(changeable({ profile: 'resource', state: 'active' })).toBe(false);
  });
});

describe('audience changes', () => {
  // TDD-identity-control-003 §Registration Changes: an audience change is accepted on an active
  // public, confidential or workload client; a resource has no audience.
  it('offers an audience change on every active client, and a lifetime-class change on a resource', () => {
    expect(changeKinds({ profile: 'public', state: 'active' })).toEqual(['redirect_uris', 'audience']);
    expect(changeKinds({ profile: 'confidential', state: 'active' })).toEqual(['redirect_uris', 'audience']);
    expect(changeKinds({ profile: 'workload', state: 'active' })).toEqual(['audience']);
    expect(changeKinds({ profile: 'resource', state: 'active' })).toEqual(['lifetime_class']);
  });

  it('offers nothing on a registration that is not active', () => {
    for (const state of ['pending', 'suspended', 'retired'] as const) {
      expect(changeKinds({ profile: 'confidential', state })).toEqual([]);
      expect(changeKinds({ profile: 'workload', state })).toEqual([]);
      expect(changeKinds({ profile: 'resource', state })).toEqual([]);
    }
  });

  // ADR-IAM-003 §5.9: a lifetime-class change's before and after are its two classes.
  it('reads a lifetime-class change as its two classes', () => {
    const lifetime = {
      kind: 'lifetime_class',
      previous_redirect_uris: null,
      redirect_uris: null,
      previous_audience: null,
      audience: null,
      previous_lifetime_class: 'L1',
      lifetime_class: 'L0',
    } as const;
    expect(changeValues(lifetime as unknown as RegistrationChange)).toEqual({
      before: ['L1'],
      after: ['L0'],
    });
    expect(classMinutes.L3).toEqual({ token: 9, revocation: 10 });
  });
});

describe('registration requests', () => {
  it('reads owners one per line, each once', () => {
    expect(ownerLines(' a \n\nb\na\n')).toEqual(['a', 'b']);
  });

  it('offers a request to an application developer in production only', () => {
    const developer = { provider: false, application_developer: true } as const;
    expect(mayRequest({ ...developer, environment: 'production' })).toBe(true);
    expect(mayRequest({ ...developer, environment: 'non-production' })).toBe(false);
    expect(mayRequest({ ...developer, application_developer: false, environment: 'production' })).toBe(false);
  });
});

describe('ownerRevocable', () => {
  const owner = (id: string, extra: Partial<Owner> = {}): Owner => ({
    ownership_id: `o-${id}`,
    registration_id: 'r',
    principal_id: id,
    granted_by: 'p',
    grant_reason: 'reason',
    granted_at: '2026-10-01T00:00:00Z',
    revoked_at: null,
    revoked_by: null,
    active: true,
    ...extra,
  });

  it('holds production to two active owners, and nothing else to any', () => {
    const two = [owner('a'), owner('b')];
    const three = [...two, owner('c')];
    expect(ownerRevocable(two[0] as Owner, two, 'production')).toBe(false);
    expect(ownerRevocable(three[0] as Owner, three, 'production')).toBe(true);
    expect(ownerRevocable(two[0] as Owner, two, 'non-production')).toBe(true);
  });

  it('always allows an ownership that confers nothing, and never a revoked one', () => {
    const idle = owner('c', { active: false });
    expect(ownerRevocable(idle, [owner('a'), owner('b'), idle], 'production')).toBe(true);
    const gone = owner('d', { active: false, revoked_at: '2026-10-02T00:00:00Z' });
    expect(ownerRevocable(gone, [gone], 'non-production')).toBe(false);
  });
});
