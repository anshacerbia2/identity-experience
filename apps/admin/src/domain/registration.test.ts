import { describe, expect, it } from 'vitest';

import {
  convergenceSeconds,
  daysLeft,
  lifecycleActions,
  needsOperator,
  openFindingsByRegistration,
  unmanagedClients,
  unmanagedEnabled,
  type Finding,
  type Registration,
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
