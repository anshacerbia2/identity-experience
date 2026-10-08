import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { testClientKey } from './support/client-key.js';
import {
  cookieValue,
  publicOrigin,
  sessionKey,
  sessionOf,
  signIn,
  startHarness,
  webRoot,
  type Harness,
} from './support/harness.js';
import { defaultUser } from './support/identity-provider.js';
import { digest } from '../src/session/seal.js';

// The production gate's automatable evidence (ROADMAP §Gates, TDD-identity-experience-001 §Testing
// Strategy): token containment asserted on every endpoint, the three forgery defences each shown to
// refuse on its own, and the revocation bound the refresh path keeps when a back-channel logout is
// lost. Against a real PostgreSQL session store and the PS256-signing stand-in for the kernel.

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness({ developerWebRoot: webRoot('console'), accountWebRoot: webRoot('account') });
}, 60_000);

afterAll(async () => {
  await harness.close();
});

beforeEach(() => {
  harness.provider.refreshBehaviour = 'rotate';
  harness.upstream.answer = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: '{"ok":true}',
  };
});

const page = { accept: 'text/html,application/xhtml+xml' };
const sessionCookie = (session: string): Record<string, string> => ({ '__Host-ident_session': session });

async function csrfOf(session: string): Promise<string> {
  return (await sessionOf(harness, session)).csrfToken ?? '';
}

// A JSON Web Token of any issuer: three base64url parts, the first two JSON objects. None belongs in
// a response, whoever issued it.
const jwtShape = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/;

// secrets is every credential the scan looks for: each token the kernel issued, the client's private
// key as it would leak in a JWK or a PEM, and the key that seals the session store's tokens.
function secrets(extra: readonly string[]): string[] {
  const jwk = testClientKey().key.privateKey.export({ format: 'jwk' });
  const pemLines = testClientKey()
    .pem.split('\n')
    .filter((line) => line !== '' && !line.startsWith('-----'))
    // The first line is the PKCS #8 header every key of this size shares; the rest is this key's.
    .slice(1);
  return [
    ...harness.provider.issuedSecrets,
    ...[jwk.d, jwk.p, jwk.q, jwk.dp, jwk.dq, jwk.qi].map(String),
    ...pemLines,
    sessionKey.toString('base64'),
    sessionKey.toString('base64url'),
    sessionKey.toString('hex'),
    ...extra,
  ];
}

function assertContained(responses: ReadonlyMap<string, LightMyRequestResponse>, extra: readonly string[]) {
  const all = secrets(extra);
  for (const [name, response] of responses) {
    const surface = `${JSON.stringify(response.headers)}\n${response.body}`;
    expect(jwtShape.test(surface), `${name} carries a JSON Web Token`).toBe(false);
    for (const secret of all) {
      expect(surface.includes(secret), `${name} carries a credential`).toBe(false);
    }
  }
}

describe('token containment on every endpoint', () => {
  // Every route the BFF answers, on its success and its refusal paths: the probe, the three
  // applications' pages and assets, sign-in in each form, the callback refused and completed, the
  // session read, the proxy through a refresh, a step-up, an upstream 401, a refused and an
  // unreachable refresh, both forgery refusals, both answers of the back-channel logout, sign-out,
  // and the problem documents. Not one response carries a token, a key, or the authorization code.
  it('no response body or header carries a token, a key, or the authorization code', async () => {
    const responses = new Map<string, LightMyRequestResponse>();
    const record = (name: string, response: LightMyRequestResponse): LightMyRequestResponse => {
      responses.set(name, response);
      return response;
    };
    const get = (url: string, headers: Record<string, string> = {}, cookies: Record<string, string> = {}) =>
      harness.app.inject({ method: 'GET', url, headers, cookies });
    const codes: string[] = [];

    record('GET /healthz', await get('/healthz'));
    for (const url of ['/', '/registrations', '/developer/', '/account/']) {
      record(`GET ${url}`, await get(url, page));
    }
    record('GET /assets/…', await get('/assets/app-3f9a.js'));
    record('GET /developer/assets/…', await get('/developer/assets/app-3f9a.js'));
    record('GET /api/nothing', await get('/api/nothing'));
    record('GET /auth/nothing', await get('/auth/nothing'));
    record('GET /auth/session, signed out', await get('/auth/session'));
    record('GET /api/v1 without a session', await get('/api/v1/registrations'));

    // Sign-in in every form the BFF takes, and a callback in a browser that did not start it.
    for (const query of [
      '',
      '?return_to=/developer/',
      '?return_to=/account/&kc_action=CONFIGURE_TOTP',
      '?max_age=0&acr_values=aal2',
    ]) {
      record(`GET /auth/login${query}`, await get(`/auth/login${query}`));
    }
    const stray = await get('/auth/login');
    const strayQuery = harness.provider.authorize(String(stray.headers.location));
    codes.push(new URLSearchParams(strayQuery).get('code') ?? '');
    record('GET /auth/callback, no binding', await get(`/auth/callback${strayQuery}`));

    const { session, login, callback } = await signIn(harness);
    record('GET /auth/login, completed', login);
    record('GET /auth/callback, completed', callback);
    record('GET /auth/session', await get('/auth/session', {}, sessionCookie(session)));
    const csrf = await csrfOf(session);
    const post = (url: string, headers: Record<string, string>, body = '{}') =>
      harness.app.inject({
        method: 'POST',
        url,
        headers: { 'content-type': 'application/json', ...headers },
        cookies: sessionCookie(session),
        payload: body,
      });
    const sameOrigin = { origin: publicOrigin, 'x-csrf-token': csrf };

    record('GET /api/v1', await get('/api/v1/registrations', {}, sessionCookie(session)));
    record('POST /api/v1', await post('/api/v1/registrations', sameOrigin));
    record(
      'POST /api/v1, foreign Origin',
      await post('/api/v1/registrations', { origin: 'https://evil.example', 'x-csrf-token': csrf }),
    );
    record('POST /api/v1, no token', await post('/api/v1/registrations', { origin: publicOrigin }));

    // Through a refresh, which issues new tokens server-side.
    const lifetime = harness.provider.accessTokenLifetimeSeconds * 1000;
    harness.clock.advance(lifetime - 20_000);
    try {
      record('GET /api/v1 through a refresh', await get('/api/v1/x', {}, sessionCookie(session)));
    } finally {
      harness.clock.advance(-(lifetime - 20_000));
    }

    harness.upstream.answer = {
      status: 401,
      headers: {
        'www-authenticate': 'Bearer error="insufficient_user_authentication", max_age=300',
        'content-type': 'application/problem+json',
      },
      body: '{"type":"https://problems.scnehaux.com/authentication-required","status":401}',
    };
    record('POST /api/v1, step-up', await post('/api/v1/principals/p1:suspend', sameOrigin));

    // Sign-out, then a back-channel logout refused and accepted, on sessions of their own.
    record('POST /auth/logout', await post('/auth/logout', sameOrigin));
    const second = await signIn(harness);
    const sid = harness.provider.sessionOfLatest().sid;
    const logoutToken = await harness.provider.logoutToken({ sub: defaultUser.sub, sid });
    const backChannel = (token: string) =>
      harness.app.inject({
        method: 'POST',
        url: '/auth/back-channel-logout',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `logout_token=${token}`,
      });
    const forged = await harness.provider.logoutToken({ sub: defaultUser.sub, sid }, 'foreign');
    record('POST /auth/back-channel-logout, refused', await backChannel(forged));
    record('POST /auth/back-channel-logout', await backChannel(logoutToken));
    expect((await sessionOf(harness, second.session)).authenticated).toBe(false);

    // The other ways a session ends: an upstream 401, a refused refresh, and a kernel outage.
    harness.upstream.answer = { status: 401, body: '{}' };
    const third = await signIn(harness);
    record('GET /api/v1, upstream 401', await get('/api/v1/x', {}, sessionCookie(third.session)));
    harness.upstream.answer = { status: 200, headers: { 'content-type': 'application/json' }, body: '{}' };
    for (const behaviour of ['unavailable', 'invalid_grant'] as const) {
      const { session: held } = await signIn(harness);
      harness.provider.refreshBehaviour = behaviour;
      harness.clock.advance(lifetime);
      try {
        record(`GET /api/v1, refresh ${behaviour}`, await get('/api/v1/x', {}, sessionCookie(held)));
      } finally {
        harness.clock.advance(-lifetime);
        harness.provider.refreshBehaviour = 'rotate';
      }
    }

    // The authorization code a refused callback carried, and both logout tokens, must not come back.
    expect(responses.size).toBeGreaterThanOrEqual(30);
    assertContained(responses, [...codes, logoutToken, forged]);
  });

  it('the session store’s rows, sign-ins in flight included, hold no token and no cookie value in plaintext', async () => {
    const { session } = await signIn(harness);
    await harness.app.inject({ method: 'GET', url: '/auth/login' });
    const { rows } = await harness.database.pool.query<{ row: string }>(
      `SELECT row_to_json(s)::text AS row FROM sessions s WHERE id_hash = $1
       UNION ALL SELECT row_to_json(l)::text FROM login_states l`,
      [digest(session)],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const stored = rows.map((row) => row.row).join('\n');
    expect(jwtShape.test(stored)).toBe(false);
    for (const secret of [...harness.provider.issuedSecrets, session]) {
      expect(stored.includes(secret)).toBe(false);
    }
  });
});

describe('each forgery defence refuses on its own', () => {
  // TDD-identity-experience-001 §Cross-Site Request Forgery Defence: three independent checks, so a
  // defect in any one leaves the other two. Each case below gets the other two right, and is
  // refused by the one under test alone; the control case shows the same request passes with all
  // three.
  async function attempt(options: {
    readonly cookie: boolean;
    readonly origin: string;
    readonly csrf: 'right' | 'wrong';
  }) {
    const { session, callback } = await signIn(harness);
    const csrf = await csrfOf(session);
    const before = harness.upstream.received.length;
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/registrations',
      headers: {
        'content-type': 'application/json',
        origin: options.origin,
        'x-csrf-token': options.csrf === 'right' ? csrf : 'forged',
      },
      cookies: options.cookie ? sessionCookie(session) : {},
      payload: '{"display_name":"x"}',
    });
    return { response, reached: harness.upstream.received.length > before, callback };
  }

  it('passes when all three hold', async () => {
    const { response, reached } = await attempt({ cookie: true, origin: publicOrigin, csrf: 'right' });
    expect(response.statusCode).toBe(200);
    expect(reached).toBe(true);
  });

  it('SameSite: the cookie a browser withholds from a cross-site post leaves nothing to act for', async () => {
    const { response, reached, callback } = await attempt({
      cookie: false,
      origin: publicOrigin,
      csrf: 'right',
    });
    // The attribute is what makes the browser withhold it; the browser's enforcement of it is not
    // exercised here, which needs a real browser.
    const setCookie = [callback.headers['set-cookie']].flat().join('\n');
    expect(setCookie).toMatch(/__Host-ident_session=[^;]+;.*SameSite=Lax/i);
    expect(response.statusCode).toBe(401);
    expect(reached).toBe(false);
  });

  it('Origin: a foreign origin is refused with the cookie and the right token', async () => {
    const { response, reached } = await attempt({
      cookie: true,
      origin: 'https://evil.example',
      csrf: 'right',
    });
    expect(response.statusCode).toBe(403);
    expect(reached).toBe(false);
  });

  it('CSRF token: a wrong token is refused with the cookie and this origin', async () => {
    const { response, reached } = await attempt({ cookie: true, origin: publicOrigin, csrf: 'wrong' });
    expect(response.statusCode).toBe(403);
    expect(reached).toBe(false);
  });
});

describe('the revocation bound', () => {
  // ROADMAP Week 2 exit, TDD-identity-experience-001 §How a Revocation Reaches an Open Tab: a removed
  // Keycloak session ends the BFF session within the remaining lifetime of the access token held at
  // the moment of removal, with no back-channel logout delivered. The kernel removing the session
  // is modelled by the stand-in refusing the refresh, as Keycloak answers invalid_grant. This proves
  // the bound the BFF keeps; it is not the wall-clock measurement from a Membership revocation,
  // which needs the kernel and the Control API together.
  for (const revokedAfterSeconds of [0, 60, 215, 239, 400]) {
    it(`an active tab is signed out within the remaining token lifetime, revoked ${revokedAfterSeconds} s in`, async () => {
      const { session } = await signIn(harness);
      const stepMs = 5_000;
      let elapsed = 0;
      let bound: Date | null = null;
      try {
        for (;;) {
          if (bound === null && elapsed >= revokedAfterSeconds * 1000) {
            // The kernel session is gone from here on. What the session holds now is the bound.
            harness.provider.refreshBehaviour = 'invalid_grant';
            const { rows } = await harness.database.pool.query<{ access_expires_at: Date }>(
              'SELECT access_expires_at FROM sessions WHERE id_hash = $1',
              [digest(session)],
            );
            bound = rows[0]?.access_expires_at ?? null;
            expect(bound).not.toBeNull();
          }
          const response = await harness.app.inject({
            method: 'GET',
            url: '/api/v1/x',
            cookies: sessionCookie(session),
          });
          if (response.statusCode === 401) {
            expect(bound, 'the session ended before the kernel removed its own').not.toBeNull();
            expect(harness.clock.now().getTime()).toBeLessThanOrEqual((bound as Date).getTime());
            expect(cookieValue(response, '__Host-ident_session')).toBe('');
            break;
          }
          expect(response.statusCode).toBe(200);
          expect(elapsed, 'the session outlived its bound').toBeLessThan(
            (revokedAfterSeconds + harness.provider.accessTokenLifetimeSeconds) * 1000,
          );
          harness.clock.advance(stepMs);
          elapsed += stepMs;
        }
        expect((await sessionOf(harness, session)).authenticated).toBe(false);
      } finally {
        harness.clock.advance(-elapsed);
      }
    });
  }

  it('an idle tab exercises nothing in between, and its first request after the bound is refused', async () => {
    const { session } = await signIn(harness);
    harness.provider.refreshBehaviour = 'invalid_grant';
    const idle = harness.provider.accessTokenLifetimeSeconds * 1000;
    harness.clock.advance(idle);
    try {
      const before = harness.upstream.received.length;
      const response = await harness.app.inject({
        method: 'GET',
        url: '/api/v1/x',
        cookies: sessionCookie(session),
      });
      expect(response.statusCode).toBe(401);
      expect(harness.upstream.received.length).toBe(before);
    } finally {
      harness.clock.advance(-idle);
    }
  });
});
