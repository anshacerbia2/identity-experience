import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureInvitationToken, forgetInvitationToken, heldInvitationToken } from './invitation-fragment';

// TDD-identity-experience-001 1.24.0 §The Token in the Fragment.

const history = () => ({ state: { key: 'k' }, replaceState: vi.fn() });

afterEach(() => {
  forgetInvitationToken();
});

describe('the invitation token in the fragment', () => {
  it('is taken on the enrolment page, cleared from the address bar, and held in memory alone', () => {
    const h = history();
    const before = window.sessionStorage.length + window.localStorage.length;
    captureInvitationToken({ pathname: '/account/enrol', search: '', hash: '#inv_9Qk2%2FnV7' }, h);
    expect(heldInvitationToken()).toBe('inv_9Qk2/nV7');
    expect(h.replaceState).toHaveBeenCalledWith({ key: 'k' }, '', '/account/enrol');
    expect(window.sessionStorage.length + window.localStorage.length).toBe(before);
  });

  it('leaves another page’s fragment alone', () => {
    const h = history();
    captureInvitationToken({ pathname: '/account/consents', search: '', hash: '#section' }, h);
    expect(heldInvitationToken()).toBeNull();
    expect(h.replaceState).not.toHaveBeenCalled();
  });

  it('holds nothing without a fragment, and forgets the token once used', () => {
    captureInvitationToken({ pathname: '/account/enrol', search: '', hash: '' }, history());
    expect(heldInvitationToken()).toBeNull();
    captureInvitationToken({ pathname: '/account/enrol/', search: '', hash: '#t' }, history());
    expect(heldInvitationToken()).toBe('t');
    forgetInvitationToken();
    expect(heldInvitationToken()).toBeNull();
  });
});
