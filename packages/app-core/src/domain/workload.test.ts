import { describe, expect, it } from 'vitest';

import { mayReview, reviewOverdue } from './workload';

const owner = '01a0da74-44e7-7000-b600-b464c5cb8cec';

describe('mayReview', () => {
  it('is the owner’s alone, of an active workload, whatever the identifier’s case', () => {
    expect(mayReview({ state: 'active', owner_principal_id: owner }, owner)).toBe(true);
    expect(mayReview({ state: 'active', owner_principal_id: owner }, owner.toUpperCase())).toBe(true);
    expect(mayReview({ state: 'active', owner_principal_id: owner }, 'someone-else')).toBe(false);
    expect(mayReview({ state: 'active', owner_principal_id: owner }, null)).toBe(false);
  });

  it('is never offered for a workload that is not active', () => {
    for (const state of ['pending', 'orphaned', 'suspended', 'retired'] as const) {
      expect(mayReview({ state, owner_principal_id: owner }, owner)).toBe(false);
    }
  });
});

describe('reviewOverdue', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  it('is overdue only once the due date has passed', () => {
    expect(reviewOverdue({ review_due_at: '2026-10-08T11:59:59Z' }, now)).toBe(true);
    expect(reviewOverdue({ review_due_at: '2026-10-08T12:00:00Z' }, now)).toBe(false);
    expect(reviewOverdue({ review_due_at: '2027-01-06T12:00:00Z' }, now)).toBe(false);
  });

  it('is never overdue without a due date', () => {
    expect(reviewOverdue({}, now)).toBe(false);
  });
});
