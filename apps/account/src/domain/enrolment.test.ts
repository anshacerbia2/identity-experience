import { describe, expect, it } from 'vitest';

import { isCode, minutesFrom, normalizedCode, requestOutcome, verifyOutcome } from './enrolment';

// TDD-identity-experience-001 1.24.0 §One Sentence per Answer: each status is one outcome, and the
// outcome of a request never depends on the token beyond its status.

describe('the code', () => {
  it('is 8 digits, typed with or without spaces and dashes', () => {
    expect(isCode('48213907')).toBe(true);
    expect(isCode('4821 3907')).toBe(true);
    expect(isCode('4821-3907')).toBe(true);
    expect(normalizedCode(' 4821 3907 ')).toBe('48213907');
    expect(isCode('4821390')).toBe(false);
    expect(isCode('48213907a')).toBe(false);
    expect(isCode('')).toBe(false);
  });
});

describe('the answers', () => {
  it('reads Retry-After as whole minutes, at least one', () => {
    expect(minutesFrom('42')).toBe(1);
    expect(minutesFrom('61')).toBe(2);
    expect(minutesFrom('3600')).toBe(60);
    expect(minutesFrom(null)).toBe(1);
    expect(minutesFrom('soon')).toBe(1);
  });

  it('maps every request status to one outcome', () => {
    expect(requestOutcome(202, null, 'id')).toEqual({ kind: 'sent', enrolmentId: 'id' });
    expect(requestOutcome(202, null, null)).toEqual({ kind: 'unavailable' });
    expect(requestOutcome(429, '120', null)).toEqual({ kind: 'limited', minutes: 2 });
    expect(requestOutcome(400, null, null)).toEqual({ kind: 'refused' });
    for (const status of [401, 403, 404, 500, 503]) {
      expect(requestOutcome(status, null, null)).toEqual({ kind: 'unavailable' });
    }
  });

  it('maps every verification status to one outcome', () => {
    const account = { username: 'ada@example.com', temporaryPassword: 'x', lapsesAt: '2026-10-22T09:00:00Z' };
    expect(verifyOutcome(201, null, account)).toEqual({ kind: 'created', account });
    expect(verifyOutcome(201, null, null)).toEqual({ kind: 'unavailable' });
    expect(verifyOutcome(400, null, null)).toEqual({ kind: 'wrong' });
    expect(verifyOutcome(429, '30', null)).toEqual({ kind: 'limited', minutes: 1 });
    for (const status of [403, 500, 503]) {
      expect(verifyOutcome(status, null, null)).toEqual({ kind: 'unavailable' });
    }
  });
});
