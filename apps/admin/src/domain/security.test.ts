import { describe, expect, it } from 'vitest';

import {
  containmentActions,
  firstFactorsAfter,
  revocable,
  searchable,
  type Authenticator,
  type PrincipalDetail,
} from './security';

const principal = (overrides: Partial<PrincipalDetail> = {}): PrincipalDetail => ({
  principal_id: 'p-1',
  username: 'alice',
  subject_type: 'human',
  state: 'active',
  realm: 'scnehaux',
  created_at: '2026-10-01T00:00:00Z',
  activated_at: '2026-10-01T00:00:00Z',
  quarantined_at: null,
  version: 1,
  security_version: 1,
  ...overrides,
});

describe('containment actions', () => {
  it('offers what the API accepts for the state', () => {
    expect(containmentActions(principal(), 'me')).toEqual(['suspend', 'terminate-all']);
    expect(containmentActions(principal({ state: 'suspended' }), 'me')).toEqual(['restore', 'terminate-all']);
    for (const state of ['pending', 'quarantined', 'retired'] as const) {
      expect(containmentActions(principal({ state }), 'me')).toEqual([]);
    }
  });

  it('offers nothing on the operator’s own Principal or on a workload', () => {
    expect(containmentActions(principal(), 'p-1')).toEqual([]);
    expect(containmentActions(principal({ subject_type: 'workload' }), 'me')).toEqual([]);
  });
});

describe('revocation', () => {
  const password: Authenticator = { security_ref: 'r1', type: 'password', created: '' };
  const otp: Authenticator = { security_ref: 'r2', type: 'otp', created: '' };
  const passkey: Authenticator = { security_ref: 'r3', type: 'webauthn-passwordless', created: '' };

  it('counts the first factors that remain', () => {
    expect(firstFactorsAfter([password, otp], password)).toBe(0);
    expect(firstFactorsAfter([password, otp, passkey], password)).toBe(1);
    expect(firstFactorsAfter([password, otp], otp)).toBe(1);
  });

  it('does not offer the last first factor, and offers a second factor', () => {
    expect(revocable([password, otp], password)).toBe(false);
    expect(revocable([password, otp], otp)).toBe(true);
    expect(revocable([password, passkey], password)).toBe(true);
    expect(revocable([{ type: 'otp', created: '' }], { type: 'otp', created: '' })).toBe(false);
  });
});

describe('search', () => {
  it('needs three characters that are not wildcards', () => {
    expect(searchable('ali')).toBe(true);
    expect(searchable('al')).toBe(false);
    expect(searchable('a*%_ ')).toBe(false);
    expect(searchable('')).toBe(false);
  });
});
