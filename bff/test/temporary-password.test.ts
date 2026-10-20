import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { testClientKey } from './support/client-key.js';
import { createTestDatabase, type TestDatabase } from './support/database.js';
import { Clock, publicOrigin, sessionOf, signIn, testConfig, type Harness } from './support/harness.js';
import { IdentityProvider } from './support/identity-provider.js';
import { Upstream } from './support/upstream.js';
import { buildServer } from '../src/server.js';

// TDD-identity-experience-003 1.28.0 §A First Credential, Shown Once; STD-IAM-001 2.8.0 §3.1. The BFF
// carries a temporary password once, from the Identity Control API to the issuing provider's browser:
// the answer reaches the browser with Cache-Control: no-store, and no log line, at the most verbose
// level, holds any part of the value or the reason, on the 201, on its retry or on a refusal.

const value = 'K7QH2M9XRT4WZP6VDN3BC8FA';
const reason = 'new joiner, verified on a call';
const path = '/api/v1/principals/0192f0e0-3333-7000-8000-000000000007:issue-temporary-password';

let harness: Harness;
let upstream: Upstream;
let database: TestDatabase;
let app: FastifyInstance;
const lines: string[] = [];

beforeAll(async () => {
  const provider = new IdentityProvider();
  upstream = new Upstream();
  await Promise.all([provider.start(), upstream.start()]);
  database = await createTestDatabase();
  const clock = new Clock();
  app = await buildServer(
    testConfig({
      oidc: {
        issuer: provider.issuer,
        internalBaseUrl: provider.issuer,
        clientId: provider.clientId,
        clientKey: testClientKey().key,
        redirectUri: `${publicOrigin}/auth/callback`,
      },
      identityControlBaseUrl: upstream.baseUrl,
      databaseUrl: database.url,
      logLevel: 'trace',
    }),
    {
      now: clock.now,
      logStream: {
        write(line: string) {
          lines.push(line);
        },
      },
    },
  );
  harness = {
    app,
    provider,
    upstream,
    database,
    clock,
    async close() {
      await app.close();
      await Promise.all([provider.stop(), upstream.stop(), database.drop()]);
    },
  };
}, 60_000);

afterAll(async () => {
  await harness.close();
});

beforeEach(() => {
  lines.length = 0;
});

async function issue(): Promise<LightMyRequestResponse> {
  const { session } = await signIn(harness);
  const csrf = (await sessionOf(harness, session)).csrfToken ?? '';
  return app.inject({
    method: 'POST',
    url: path,
    headers: {
      'content-type': 'application/json',
      origin: publicOrigin,
      'x-csrf-token': csrf,
      'idempotency-key': '6f1d2c8e-1a2b-4c3d-9e8f-0123456789ab',
      'x-administrative-reason': reason,
    },
    cookies: { '__Host-ident_session': session },
    payload: '{}',
  });
}

const answer = (withValue: boolean) =>
  JSON.stringify({
    temporary_password: {
      issuance_id: '0192f0e0-7777-7000-8000-000000000001',
      principal_id: '0192f0e0-3333-7000-8000-000000000007',
      issued_at: '2026-10-19T09:00:00Z',
      lapses_at: '2026-10-20T09:00:00Z',
      ...(withValue ? { value } : {}),
    },
  });

function assertUnlogged(): void {
  // The level was trace, so the request and its completion were logged: the scan has lines to read.
  expect(lines.length).toBeGreaterThan(0);
  const log = lines.join('');
  expect(log).not.toContain(value);
  // No fragment of it either: the value split anywhere, as a body or header dump would quote it.
  for (let i = 0; i + 8 <= value.length; i += 4) {
    expect(log).not.toContain(value.slice(i, i + 8));
  }
  expect(log).not.toContain(reason);
}

describe('a temporary password through the BFF', () => {
  it('reaches the browser once, with Cache-Control: no-store, and is in no log line', async () => {
    upstream.answer = {
      status: 201,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: answer(true),
    };
    const response = await issue();
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json<{ temporary_password: { value: string } }>().temporary_password.value).toBe(value);
    // The command reached the API as sent: the reason and the key forwarded, the body untouched.
    const forwarded = upstream.last();
    expect(forwarded.url).toBe(
      '/v1/principals/0192f0e0-3333-7000-8000-000000000007:issue-temporary-password',
    );
    expect(forwarded.headers['x-administrative-reason']).toBe(reason);
    expect(forwarded.headers['idempotency-key']).toBe('6f1d2c8e-1a2b-4c3d-9e8f-0123456789ab');
    assertUnlogged();
  });

  it('carries a retry answered without the value the same way', async () => {
    upstream.answer = {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: answer(false),
    };
    const response = await issue();
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toContain('"value"');
    assertUnlogged();
  });

  it('sets no-store even when the API sends no Cache-Control, and logs nothing of a refusal', async () => {
    upstream.answer = {
      status: 409,
      headers: { 'content-type': 'application/problem+json' },
      body: JSON.stringify({
        type: 'https://problems.scnehaux.com/state-transition-refused',
        status: 409,
        detail: `credential-established ${value}`,
      }),
    };
    const response = await issue();
    expect(response.statusCode).toBe(409);
    expect(response.headers['cache-control']).toBe('no-store');
    assertUnlogged();
  });

  it('logs nothing of the value when the API is unreachable mid-answer', async () => {
    upstream.answer = { status: 502, headers: { 'content-type': 'text/plain' }, body: value };
    const response = await issue();
    expect(response.statusCode).toBe(502);
    expect(response.headers['cache-control']).toBe('no-store');
    assertUnlogged();
  });
});
