import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { jwtVerify } from 'jose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { testClientKey } from './support/client-key.js';
import { Clock, publicOrigin, testConfig } from './support/harness.js';
import { Upstream } from './support/upstream.js';
import { parseClientKey, type ClientKey } from '../src/auth/client-key.js';
import { loadConfig, type Config } from '../src/config.js';
import { clientAddress, forwardedFor, ingressList } from '../src/enrolment/client-address.js';
import { buildServer } from '../src/server.js';

// TDD-identity-experience-001 1.24.0 §Enrolment From an Invitation; ADR-IAM-011 §5.1 to §5.3, §5.8.
// The two anonymous routes: the forgery checks before the body is read, the BFF's own enrolment
// workload and the client address it states in Forwarded, one answer per status with identity-control's
// body never passed on, and no token, code or password in any log line.

const workloadClientId = 'identity-experience-enrolment-test';
const invitationToken = 'inv_9Qk2nV7xLr4ZpT8sWm3Yb6Hc';
const enrolmentId = '0192f0e0-9999-7000-8000-000000000001';
const code = '48213907';
const temporaryPassword = 'K7QH2M9XRT4WZP6VDN3BC8FA';

// A stand-in for the kernel's token endpoint: the client credentials grant of the enrolment workload,
// authenticated by its own PS256 assertion, as the kernel checks a private_key_jwt client.
class Kernel {
  issuer = '';
  issued = 0;
  refuse = false;
  #server: Server | null = null;

  constructor(private readonly publicKey: KeyObject) {}

  async start(): Promise<void> {
    this.#server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        void this.#token(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))).then(
          ({ status, body }) => {
            response.writeHead(status, { 'content-type': 'application/json' });
            response.end(JSON.stringify(body));
          },
        );
      });
    });
    await new Promise<void>((resolve) => this.#server?.listen(0, '127.0.0.1', resolve));
    const { port } = this.#server.address() as AddressInfo;
    this.issuer = `http://127.0.0.1:${port}/realms/test`;
  }

  async #token(form: URLSearchParams): Promise<{ status: number; body: unknown }> {
    if (this.refuse || form.get('grant_type') !== 'client_credentials' || form.has('client_secret')) {
      return { status: 401, body: { error: 'invalid_client' } };
    }
    try {
      await jwtVerify(form.get('client_assertion') ?? '', this.publicKey, {
        algorithms: ['PS256'],
        issuer: workloadClientId,
        subject: workloadClientId,
        audience: this.issuer,
      });
    } catch {
      return { status: 401, body: { error: 'invalid_client' } };
    }
    this.issued += 1;
    return {
      status: 200,
      body: { access_token: `workload-token-${String(this.issued)}`, expires_in: 300, token_type: 'Bearer' },
    };
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.#server === null) {
        resolve();
        return;
      }
      this.#server.close(() => {
        resolve();
      });
    });
  }
}

let workloadKey: ClientKey;
let workloadKeyFile: string;
let kernel: Kernel;
let upstream: Upstream;
const lines: string[] = [];
const apps: FastifyInstance[] = [];

beforeAll(async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  workloadKey = parseClientKey(pem);
  workloadKeyFile = join(mkdtempSync(join(tmpdir(), 'bff-enrolment-key-')), 'enrolment.pem');
  writeFileSync(workloadKeyFile, pem, { mode: 0o600 });
  kernel = new Kernel(publicKey);
  upstream = new Upstream();
  await Promise.all([kernel.start(), upstream.start()]);
});

afterAll(async () => {
  await Promise.all([kernel.stop(), upstream.stop()]);
});

beforeEach(() => {
  upstream.received.length = 0;
  lines.length = 0;
  kernel.refuse = false;
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function server(overrides: Partial<Config> = {}): Promise<FastifyInstance> {
  const app = await buildServer(
    testConfig({
      oidc: {
        issuer: kernel.issuer,
        internalBaseUrl: kernel.issuer,
        clientId: 'identity-experience',
        clientKey: testClientKey().key,
        redirectUri: `${publicOrigin}/auth/callback`,
      },
      identityControlBaseUrl: upstream.baseUrl,
      // The enrolment routes read no session, so no database is reached.
      databaseUrl: 'postgres://nobody@127.0.0.1:9/none',
      logLevel: 'trace',
      enrolment: { clientId: workloadClientId, clientKey: workloadKey },
      ...overrides,
    }),
    {
      now: new Clock().now,
      logStream: {
        write(line: string) {
          lines.push(line);
        },
      },
    },
  );
  apps.push(app);
  return app;
}

const browserHeaders = {
  origin: publicOrigin,
  'sec-fetch-site': 'same-origin',
  'content-type': 'application/json',
};

const post = (url: string, payload: unknown, headers: Record<string, string> = {}): InjectOptions => ({
  method: 'POST',
  url,
  headers: { ...browserHeaders, ...headers },
  payload: JSON.stringify(payload),
});

const accepted = () => {
  upstream.answer = {
    status: 202,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify({ enrolment_id: enrolmentId }),
  };
};

describe('POST /auth/enrolment', () => {
  it('asks identity-control as the enrolment workload, with the client address, and answers its 202', async () => {
    accepted();
    const app = await server();
    const response = await app.inject(post('/auth/enrolment', { token: invitationToken }));

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ enrolment_id: enrolmentId });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();

    const sent = upstream.last();
    expect(sent.url).toBe('/v1/enrolments');
    expect(sent.headers.authorization).toBe('Bearer workload-token-1');
    expect(sent.headers.forwarded).toBe('for=127.0.0.1');
    expect(sent.headers['idempotency-key']).toBeUndefined();
    expect(JSON.parse(sent.body)).toEqual({ token: invitationToken });
  });

  it('holds one workload token until it is refused, then presents a fresh one', async () => {
    accepted();
    const app = await server();
    const before = kernel.issued;
    await app.inject(post('/auth/enrolment', { token: invitationToken }));
    await app.inject(post('/auth/enrolment', { token: invitationToken }));
    expect(kernel.issued - before).toBe(1);

    upstream.answer = { status: 401, headers: { 'content-type': 'application/problem+json' }, body: '{}' };
    expect((await app.inject(post('/auth/enrolment', { token: invitationToken }))).statusCode).toBe(503);
    accepted();
    await app.inject(post('/auth/enrolment', { token: invitationToken }));
    expect(kernel.issued - before).toBe(2);
    expect(upstream.last().headers.authorization).toBe(`Bearer workload-token-${String(kernel.issued)}`);
  });

  it.each([
    ['no Origin', { origin: '' }],
    ['another Origin', { origin: 'https://attacker.example' }],
    ['a cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
    ['a same-site fetch', { 'sec-fetch-site': 'same-site' }],
    ['no Fetch Metadata', { 'sec-fetch-site': '' }],
    ['a form body', { 'content-type': 'application/x-www-form-urlencoded' }],
    ['a text/plain body', { 'content-type': 'text/plain' }],
  ])('refuses %s with 403 before anything is read or sent', async (_name, headers) => {
    const app = await server();
    const cleaned = Object.fromEntries(
      Object.entries({ ...browserHeaders, ...headers }).filter(([, value]) => value !== ''),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/auth/enrolment',
      headers: cleaned,
      payload: JSON.stringify({ token: invitationToken }),
    });
    expect(response.statusCode).toBe(403);
    expect(upstream.received).toHaveLength(0);
  });

  it.each([
    ['no token', {}],
    ['an empty token', { token: '' }],
    ['a token that is not a string', { token: 7 }],
    ['another member', { token: invitationToken, tenant: 'x' }],
    ['an overlong token', { token: 'x'.repeat(1025) }],
  ])('refuses %s with 400 and sends nothing', async (_name, payload) => {
    const app = await server();
    const response = await app.inject(post('/auth/enrolment', payload));
    expect(response.statusCode).toBe(400);
    expect(upstream.received).toHaveLength(0);
  });

  it('ignores a forwarding header the browser sent when nothing is in front', async () => {
    accepted();
    const app = await server();
    await app.inject(
      post(
        '/auth/enrolment',
        { token: invitationToken },
        { 'x-forwarded-for': '198.51.100.7', forwarded: 'for=198.51.100.7' },
      ),
    );
    expect(upstream.last().headers.forwarded).toBe('for=127.0.0.1');
  });

  it('reads X-Forwarded-For from the trusted ingress alone', async () => {
    accepted();
    const app = await server({ trustedIngress: '127.0.0.0/8' });
    await app.inject(
      post('/auth/enrolment', { token: invitationToken }, { 'x-forwarded-for': '203.0.113.9' }),
    );
    expect(upstream.last().headers.forwarded).toBe('for=203.0.113.9');

    // A connection from elsewhere is the client itself, whatever it claims.
    await app.inject({
      ...post('/auth/enrolment', { token: invitationToken }, { 'x-forwarded-for': '203.0.113.9' }),
      remoteAddress: '192.0.2.44',
    });
    expect(upstream.last().headers.forwarded).toBe('for=192.0.2.44');
  });

  it('answers 503 when the trusted ingress states no single client address', async () => {
    accepted();
    const app = await server({ trustedIngress: '127.0.0.1' });
    for (const header of [
      {},
      { 'x-forwarded-for': '198.51.100.7, 203.0.113.9' },
      { 'x-forwarded-for': 'unknown' },
    ]) {
      const response = await app.inject(post('/auth/enrolment', { token: invitationToken }, header));
      expect(response.statusCode).toBe(503);
    }
    expect(upstream.received).toHaveLength(0);
  });

  it('answers 429 with Retry-After, and passes on no detail of identity-control', async () => {
    upstream.answer = {
      status: 429,
      headers: { 'content-type': 'application/problem+json', 'retry-after': '42' },
      body: JSON.stringify({ status: 429, detail: 'the client address is past 5 a minute' }),
    };
    const app = await server();
    const response = await app.inject(post('/auth/enrolment', { token: invitationToken }));
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('42');
    expect(response.body).not.toContain('5 a minute');
  });

  it.each([
    [403, 'the workload is not an enrolment caller'],
    [500, 'identity-control failed'],
    [503, 'Organization Control is unreachable'],
  ])('answers %s from identity-control as 503', async (status, detail) => {
    upstream.answer = {
      status,
      headers: { 'content-type': 'application/problem+json' },
      body: JSON.stringify({ detail }),
    };
    const app = await server();
    const response = await app.inject(post('/auth/enrolment', { token: invitationToken }));
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain(detail);
  });

  it('answers 503 when enrolment is not configured, or the kernel refuses the workload', async () => {
    const unconfigured = await server({ enrolment: null });
    expect((await unconfigured.inject(post('/auth/enrolment', { token: invitationToken }))).statusCode).toBe(
      503,
    );
    kernel.refuse = true;
    const refused = await server();
    expect((await refused.inject(post('/auth/enrolment', { token: invitationToken }))).statusCode).toBe(503);
    expect(upstream.received).toHaveLength(0);
  });
});

describe('POST /auth/enrolment/verify', () => {
  it('answers the temporary password once, with no-store, and logs none of it', async () => {
    upstream.answer = {
      status: 201,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({
        principal_id: '0192f0e0-aaaa-7000-8000-000000000001',
        username: 'ada@example.com',
        temporary_password: temporaryPassword,
        lapses_at: '2026-10-22T09:00:00Z',
      }),
    };
    const app = await server();
    const response = await app.inject(post('/auth/enrolment/verify', { enrolment_id: enrolmentId, code }));

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      principal_id: '0192f0e0-aaaa-7000-8000-000000000001',
      username: 'ada@example.com',
      temporary_password: temporaryPassword,
      lapses_at: '2026-10-22T09:00:00Z',
    });
    const sent = upstream.last();
    expect(sent.url).toBe(`/v1/enrolments/${enrolmentId}:verify`);
    expect(JSON.parse(sent.body)).toEqual({ code });
    expect(sent.headers.forwarded).toBe('for=127.0.0.1');

    await app.inject(post('/auth/enrolment', { token: invitationToken }));
    expect(lines.length).toBeGreaterThan(0);
    for (const secret of [temporaryPassword, code, invitationToken, 'workload-token']) {
      expect(lines.filter((line) => line.includes(secret))).toEqual([]);
    }
  });

  it('answers the one refusal as 400 without identity-control detail', async () => {
    const detail =
      'The code is wrong, has expired, or has been tried too often; start again from the invitation link';
    upstream.answer = {
      status: 400,
      headers: { 'content-type': 'application/problem+json' },
      body: JSON.stringify({ detail }),
    };
    const app = await server();
    const response = await app.inject(post('/auth/enrolment/verify', { enrolment_id: enrolmentId, code }));
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('start again');
  });

  it.each([
    ['an enrolment_id that is not a UUID', { enrolment_id: '../principals', code }],
    ['no code', { enrolment_id: enrolmentId }],
    ['another member', { enrolment_id: enrolmentId, code, token: invitationToken }],
  ])('refuses %s with 400 and sends nothing', async (_name, payload) => {
    const app = await server();
    const response = await app.inject(post('/auth/enrolment/verify', payload));
    expect(response.statusCode).toBe(400);
    expect(upstream.received).toHaveLength(0);
  });

  it('refuses a cross-site verification with 403', async () => {
    const app = await server();
    const response = await app.inject(
      post('/auth/enrolment/verify', { enrolment_id: enrolmentId, code }, { 'sec-fetch-site': 'cross-site' }),
    );
    expect(response.statusCode).toBe(403);
    expect(upstream.received).toHaveLength(0);
  });
});

describe('the client address', () => {
  it('writes IPv4 bare and IPv6 quoted in brackets (RFC 7239 §6)', () => {
    expect(forwardedFor('192.0.2.1')).toBe('for=192.0.2.1');
    expect(forwardedFor('2001:db8::17')).toBe('for="[2001:db8::17]"');
  });

  it('reads an IPv4-mapped connection as IPv4, and trusts the ingress range alone', () => {
    expect(clientAddress('::ffff:192.0.2.1', undefined, null)).toBe('192.0.2.1');
    const ingress = ingressList('10.0.0.0/8');
    expect(clientAddress('10.1.2.3', '2001:db8::9', ingress)).toBe('2001:db8::9');
    expect(clientAddress('192.0.2.1', '2001:db8::9', ingress)).toBe('192.0.2.1');
    expect(clientAddress('10.1.2.3', ['198.51.100.1', '198.51.100.2'], ingress)).toBeNull();
    expect(clientAddress(undefined, undefined, null)).toBeNull();
  });
});

describe('the enrolment configuration', () => {
  const complete = {
    IDENTITY_EXPERIENCE_PUBLIC_ORIGIN: 'https://id.example.com',
    IDENTITY_EXPERIENCE_WEB_ROOT: './web/dist',
    IDENTITY_EXPERIENCE_ISSUER: 'https://sso.example.com/realms/scnehaux',
    IDENTITY_EXPERIENCE_CLIENT_ID: 'identity-experience-bff-ada-laptop',
    IDENTITY_EXPERIENCE_CLIENT_KEY_FILE: testClientKey().file,
    IDENTITY_EXPERIENCE_REDIRECT_URI: 'https://id.example.com/auth/callback',
    IDENTITY_EXPERIENCE_SESSION_KEY: Buffer.alloc(32, 1).toString('base64'),
    IDENTITY_CONTROL_BASE_URL: 'http://identity-control:8080/',
    IDENTITY_EXPERIENCE_DATABASE_URL: 'postgres://bff@db/identity_experience',
  };

  it('serves no enrolment unless its own client and key are named', () => {
    expect(loadConfig(complete).enrolment).toBeNull();
    const config = loadConfig({
      ...complete,
      IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_ID: 'identity-experience-enrolment-ada-laptop',
      IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_KEY_FILE: workloadKeyFile,
    });
    expect(config.enrolment?.clientId).toBe('identity-experience-enrolment-ada-laptop');
    expect(config.enrolment?.clientKey.kid).toBe(workloadKey.kid);
  });

  it('refuses one variable without the other, the sign-in client, and the sign-in key', () => {
    expect(() => loadConfig({ ...complete, IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_ID: 'e' })).toThrow(
      /set together/,
    );
    expect(() =>
      loadConfig({
        ...complete,
        IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_ID: complete.IDENTITY_EXPERIENCE_CLIENT_ID,
        IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_KEY_FILE: workloadKeyFile,
      }),
    ).toThrow(/its own client/);
    expect(() =>
      loadConfig({
        ...complete,
        IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_ID: 'identity-experience-enrolment-ada-laptop',
        IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_KEY_FILE: testClientKey().file,
      }),
    ).toThrow(/its own key/);
  });

  it('takes one trusted ingress address or range, and nothing else', () => {
    expect(
      loadConfig({ ...complete, IDENTITY_EXPERIENCE_TRUSTED_INGRESS: '10.0.0.0/8' }).trustedIngress,
    ).toBe('10.0.0.0/8');
    expect(loadConfig({ ...complete, IDENTITY_EXPERIENCE_TRUSTED_INGRESS: 'fd00::1' }).trustedIngress).toBe(
      'fd00::1',
    );
    for (const value of ['10.0.0.0/33', 'caddy', '10.0.0.1,10.0.0.2', '10.0.0.0/8/1']) {
      expect(() => loadConfig({ ...complete, IDENTITY_EXPERIENCE_TRUSTED_INGRESS: value })).toThrow(
        /TRUSTED_INGRESS/,
      );
    }
  });
});
