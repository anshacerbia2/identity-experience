import { describe, expect, it } from 'vitest';

import {
  audienceList,
  createWorkloadRequest,
  isClientKey,
  readPublicKey,
  workloadActions,
  workloadUpkeep,
} from './workload';

const publicKey = { kty: 'RSA', n: 'sXch-Mo_B7E', e: 'AQAB' };

describe('readPublicKey', () => {
  it('accepts a public RSA JWK, with or without kid, use and alg', () => {
    expect(readPublicKey(JSON.stringify(publicKey))).toEqual({ key: publicKey });
    const full = { ...publicKey, kid: 'k-1', use: 'sig', alg: 'PS256' };
    expect(readPublicKey(JSON.stringify(full))).toEqual({ key: full });
  });

  it('refuses a private key before it is sent, whatever else is wrong with it', () => {
    for (const member of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth']) {
      expect(readPublicKey(JSON.stringify({ ...publicKey, [member]: 'secret' }))).toEqual({
        problem: 'private',
      });
    }
    expect(readPublicKey(JSON.stringify({ kty: 'oct', k: 'c2VjcmV0' }))).toEqual({ problem: 'private' });
  });

  it('names what else is wrong', () => {
    expect(readPublicKey('  ')).toEqual({ problem: 'empty' });
    expect(readPublicKey('-----BEGIN PUBLIC KEY-----')).toEqual({ problem: 'notJson' });
    expect(readPublicKey('[]')).toEqual({ problem: 'notJson' });
    expect(readPublicKey(JSON.stringify({ ...publicKey, kty: 'EC' }))).toEqual({ problem: 'notRsa' });
    expect(readPublicKey(JSON.stringify({ ...publicKey, x5c: ['MIIB'] }))).toEqual({ problem: 'members' });
    expect(readPublicKey(JSON.stringify({ ...publicKey, e: 65537 }))).toEqual({ problem: 'members' });
    expect(readPublicKey(JSON.stringify({ ...publicKey, n: 'not base64url!' }))).toEqual({
      problem: 'members',
    });
    expect(readPublicKey(JSON.stringify({ ...publicKey, alg: 'RS256' }))).toEqual({ problem: 'algorithm' });
    expect(readPublicKey(JSON.stringify({ ...publicKey, use: 'enc' }))).toEqual({ problem: 'algorithm' });
  });
});

describe('createWorkloadRequest', () => {
  const values = {
    displayName: ' Nightly export ',
    purpose: ' Exports payroll ',
    workloadType: 'job' as const,
    owner: ' 01a0da74-44e7-7000-b600-b464c5cb8cec ',
    teamReference: '',
    clientKey: ' nightly-job ',
    applicationRef: ' payroll ',
    audience: '',
    publicKey,
  };

  it('trims what the form holds and leaves out an empty team and audience', () => {
    expect(createWorkloadRequest(values)).toEqual({
      display_name: 'Nightly export',
      purpose: 'Exports payroll',
      workload_type: 'job',
      owner_principal_id: '01a0da74-44e7-7000-b600-b464c5cb8cec',
      client_key: 'nightly-job',
      application_ref: 'payroll',
      public_key: publicKey,
    });
  });

  it('carries a team and an audience list when given', () => {
    const request = createWorkloadRequest({
      ...values,
      teamReference: 'payroll-platform',
      audience: 'payroll-api, bank-api',
    });
    expect(request.team_reference).toBe('payroll-platform');
    expect(request.audience).toEqual(['payroll-api', 'bank-api']);
  });
});

describe('client_key and audience', () => {
  it('accepts what identity-control accepts', () => {
    expect(isClientKey('nightly-job')).toBe(true);
    expect(isClientKey('Nightly Job')).toBe(false);
    expect(isClientKey('-job')).toBe(false);
    expect(audienceList(' a, b  c,,')).toEqual(['a', 'b', 'c']);
  });
});

describe('workload lifecycle', () => {
  it('offers the actions the API accepts for the workload as it stands', () => {
    expect(workloadActions({ state: 'active' })).toEqual(['suspend']);
    expect(workloadActions({ state: 'orphaned' })).toEqual(['suspend']);
    expect(workloadActions({ state: 'suspended' })).toEqual(['restore', 'retire']);
    expect(workloadActions({ state: 'pending' })).toEqual([]);
    expect(workloadActions({ state: 'retired' })).toEqual([]);
  });
});

describe('workloadUpkeep', () => {
  const owner = '01a0da74-44e7-7000-b600-b464c5cb8cec';
  it('offers a rebuild for an active or orphaned workload, and the review to its owner alone', () => {
    expect(workloadUpkeep({ state: 'active', owner_principal_id: owner }, owner)).toEqual([
      'rebuild',
      'review',
    ]);
    expect(workloadUpkeep({ state: 'active', owner_principal_id: owner }, owner.toUpperCase())).toEqual([
      'rebuild',
      'review',
    ]);
    expect(workloadUpkeep({ state: 'active', owner_principal_id: owner }, 'someone-else')).toEqual([
      'rebuild',
    ]);
    expect(workloadUpkeep({ state: 'active', owner_principal_id: owner }, null)).toEqual(['rebuild']);
    expect(workloadUpkeep({ state: 'orphaned', owner_principal_id: owner }, owner)).toEqual(['rebuild']);
  });

  it('offers nothing for a pending, suspended or retired workload', () => {
    for (const state of ['pending', 'suspended', 'retired'] as const) {
      expect(workloadUpkeep({ state, owner_principal_id: owner }, owner)).toEqual([]);
    }
  });
});
