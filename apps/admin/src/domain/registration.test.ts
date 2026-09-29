import { describe, expect, it } from 'vitest';

import { convergenceSeconds, needsOperator, openFindingsByRegistration, type Finding } from './registration';

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
});
