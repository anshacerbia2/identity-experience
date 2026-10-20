import { describe, expect, it } from 'vitest';

import type { PrincipalDetail } from './security';
import { canIssueTemporaryPassword, credentialEstablished, issuePath } from './temporary-password';

const person: PrincipalDetail = {
  principal_id: 'p-1',
  subject_type: 'human',
  state: 'active',
  username: 'billy',
  realm: 'scnehaux',
  created_at: '2026-10-19T08:00:00Z',
  activated_at: '2026-10-19T08:00:00Z',
  quarantined_at: null,
  version: 1,
  security_version: 1,
};

describe('a first credential', () => {
  it('is offered for an active person other than the operator', () => {
    expect(canIssueTemporaryPassword(person, 'operator')).toBe(true);
    expect(canIssueTemporaryPassword(person, 'p-1')).toBe(false);
    expect(canIssueTemporaryPassword({ ...person, subject_type: 'workload' }, 'operator')).toBe(false);
    expect(canIssueTemporaryPassword({ ...person, state: 'suspended' }, 'operator')).toBe(false);
  });

  it('names the command on the Principal', () => {
    expect(issuePath('a b')).toBe('/v1/principals/a%20b:issue-temporary-password');
  });

  it('reads the API refusal for a person who set their own password', () => {
    const refused = (detail: string, status = 409) => ({
      status,
      type: 'https://problems.scnehaux.com/state-transition-refused',
      detail,
    });
    expect(credentialEstablished(refused('credential-established: the person set a password'))).toBe(true);
    expect(credentialEstablished(refused('the Principal is not active'))).toBe(false);
    expect(credentialEstablished(refused('credential-established', 400))).toBe(false);
    expect(credentialEstablished(null)).toBe(false);
  });
});
