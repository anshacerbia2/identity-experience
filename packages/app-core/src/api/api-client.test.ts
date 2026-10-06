import { describe, expect, it, vi } from 'vitest';

import { apiPost, stepUpChallenge } from './api-client';
import { stepUpHref } from '../session/session';

// RFC 9470 §3: the challenge carries insufficient_user_authentication, and the level and age asked.
describe('stepUpChallenge', () => {
  it('reads the level and the age from a step-up challenge', () => {
    expect(
      stepUpChallenge('Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=300'),
    ).toEqual({ acr: 'aal2', maxAge: 300 });
    expect(stepUpChallenge('Bearer error="insufficient_user_authentication", max_age="5"')).toEqual({
      acr: null,
      maxAge: 5,
    });
    expect(stepUpChallenge('Bearer error="insufficient_user_authentication", acr_values="aal2 phr"')).toEqual(
      {
        acr: 'aal2',
        maxAge: null,
      },
    );
  });

  it('is null for any other 401', () => {
    expect(stepUpChallenge(null)).toBeNull();
    expect(stepUpChallenge('Bearer error="invalid_token"')).toBeNull();
  });

  it('builds the sign-in it asks for', () => {
    expect(stepUpHref('/principals/p?x=1', { acr: 'aal2', maxAge: 300 })).toBe(
      '/auth/login?max_age=300&acr_values=aal2&return_to=%2Fprincipals%2Fp%3Fx%3D1',
    );
    expect(stepUpHref('/account/', { acr: 'aal2', maxAge: null })).toBe(
      '/auth/login?acr_values=aal2&return_to=%2Faccount%2F',
    );
  });
});

// A command that answers 204, such as proving a notification address, is done: there is no body to
// read (TDD-identity-control-008 1.2.0).
describe('apiPost', () => {
  it('answers nothing for a 204', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 204 })));
    await expect(
      apiPost('/v1/me/notification-addresses/x:verify', { code: '1' }, { csrfToken: 't' }),
    ).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
