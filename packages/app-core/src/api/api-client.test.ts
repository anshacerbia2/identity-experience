import { describe, expect, it } from 'vitest';

import { stepUpChallenge } from './api-client';

// RFC 9470 §3: the challenge carries insufficient_user_authentication and, here, max_age.
describe('stepUpChallenge', () => {
  it('reads max_age from a step-up challenge', () => {
    expect(stepUpChallenge('Bearer error="insufficient_user_authentication", max_age=300')).toBe(300);
    expect(stepUpChallenge('Bearer error="insufficient_user_authentication", max_age="5"')).toBe(5);
  });

  it('asks for a sign-in now when the challenge names no max_age', () => {
    expect(stepUpChallenge('Bearer error="insufficient_user_authentication"')).toBe(0);
  });

  it('is null for any other 401', () => {
    expect(stepUpChallenge(null)).toBeNull();
    expect(stepUpChallenge('Bearer error="invalid_token"')).toBeNull();
  });
});
