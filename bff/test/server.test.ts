import { request } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../src/config.js';
import { contentSecurityPolicy, securityHeaders } from '../src/http/security-headers.js';
import { buildServer } from '../src/server.js';
import { testConfig } from './support/harness.js';

let app: FastifyInstance;

// Nothing here reaches the session store or the identity kernel: the pool connects on first use,
// and no request below carries a session. The sign-in tests are in auth.test.ts.
beforeAll(async () => {
  app = await buildServer(
    testConfig({
      oidc: {
        issuer: 'http://127.0.0.1:9/realms/test',
        internalBaseUrl: 'http://127.0.0.1:9/realms/test',
        clientId: 'identity-experience',
        clientSecret: 'unused',
        redirectUri: 'https://id.example.com/auth/callback',
      },
      databaseUrl: 'postgres://unused@127.0.0.1:9/unused',
    }),
  );
});

afterAll(async () => {
  await app.close();
});

const page = { accept: 'text/html,application/xhtml+xml' };

describe('security headers', () => {
  it('are on every kind of response: probe, page, asset, API miss, and a 404', async () => {
    for (const request of [
      { url: '/healthz' },
      { url: '/registrations', headers: page },
      { url: '/assets/app-3f9a.js' },
      { url: '/api/nothing' },
      { url: '/api/v1/registrations' },
      { url: '/auth/session' },
      { url: '/nothing.png' },
    ]) {
      const response = await app.inject({ method: 'GET', ...request });
      for (const [name, value] of Object.entries(securityHeaders)) {
        expect(response.headers[name], `${name} on ${request.url}`).toBe(value);
      }
    }
  });

  it('allow nothing inline and nothing from elsewhere', () => {
    expect(contentSecurityPolicy).not.toContain('unsafe-inline');
    expect(contentSecurityPolicy).not.toContain('unsafe-eval');
    expect(contentSecurityPolicy).toContain("default-src 'none'");
    // Every directive the application needs is named, or default-src 'none' refuses it: the
    // defect an earlier revision of TDD-identity-experience-001 carried.
    for (const directive of ['script-src', 'style-src', 'font-src', 'img-src', 'connect-src']) {
      expect(contentSecurityPolicy).toMatch(new RegExp(`${directive} 'self'`));
    }
  });
});

describe('the application shell', () => {
  // The root is a directory to the static handler, which refused it: the first real run answered
  // "/" with 500 while every deeper route worked.
  it('serves index.html for the root', async () => {
    for (const headers of [page, {}]) {
      const response = await app.inject({ method: 'GET', url: '/', headers });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('<title>shell</title>');
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('answers a refused path as a client error, not a server error', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/' });
    expect(response.statusCode).toBe(404);
  });

  it('serves index.html for a client-side route, never cached', async () => {
    const response = await app.inject({ method: 'GET', url: '/registrations/abc/findings', headers: page });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>shell</title>');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('caches hashed assets for a year', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/app-3f9a.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('answers a miss under /api or /auth with a problem document, not the shell', async () => {
    for (const url of ['/api/nothing', '/auth/nothing', '/api', '/api/v2/registrations']) {
      const response = await app.inject({ method: 'GET', url, headers: page });
      expect(response.statusCode, url).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      const body = response.json<{ type: string; correlation_id: string; instance: string }>();
      expect(body.type).toBe('https://problems.scnehaux.com/not-found');
      expect(body.correlation_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.instance).toBe(url);
    }
  });

  // The injector normalizes a path before the router sees it; a real socket does not. So this one
  // goes over the wire, as an attacker's would.
  it('keeps the proxy under /v1/ whatever the path says', async () => {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    for (const path of [
      '/api/v1/../healthz',
      '/api/v1/%2e%2e/healthz',
      '/api/v1/..%2fhealthz',
      '/api//evil.example/v1/',
    ]) {
      const status = await new Promise<number>((resolve, reject) => {
        const url = new URL(address);
        request({ host: url.hostname, port: url.port, path, method: 'GET' }, (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        })
          .on('error', reject)
          .end();
      });
      // 401 would mean the path passed the guard and only the missing session stopped it.
      expect(status, path).toBe(404);
    }
  });

  it('does not serve the shell to a request that is not asking for a page', async () => {
    const response = await app.inject({ method: 'GET', url: '/missing.js' });
    expect(response.statusCode).toBe(404);
  });

  it('answers the liveness probe', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('ok\n');
  });
});

describe('configuration', () => {
  it('reports every problem at once', () => {
    let caught: unknown;
    try {
      loadConfig({ IDENTITY_EXPERIENCE_LISTEN_PORT: 'eighty', LOG_LEVEL: 'loud' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const problems = (caught as ConfigError).problems.join('\n');
    for (const fragment of [
      'PUBLIC_ORIGIN is required',
      'WEB_ROOT is required',
      'eighty is not a port',
      'loud',
    ]) {
      expect(problems).toContain(fragment);
    }
  });

  const complete = {
    IDENTITY_EXPERIENCE_PUBLIC_ORIGIN: 'https://id.example.com',
    IDENTITY_EXPERIENCE_WEB_ROOT: './web/dist',
    IDENTITY_EXPERIENCE_ISSUER: 'https://sso.example.com/realms/scnehaux',
    IDENTITY_EXPERIENCE_CLIENT_ID: 'identity-experience',
    IDENTITY_EXPERIENCE_CLIENT_SECRET: 'not-a-real-secret',
    IDENTITY_EXPERIENCE_REDIRECT_URI: 'https://id.example.com/auth/callback',
    IDENTITY_EXPERIENCE_SESSION_KEY: Buffer.alloc(32, 1).toString('base64'),
    IDENTITY_CONTROL_BASE_URL: 'http://identity-control:8080/',
    IDENTITY_EXPERIENCE_DATABASE_URL: 'postgres://bff@db/identity_experience',
  };

  it('refuses an origin with a path or trailing slash', () => {
    expect(() =>
      loadConfig({ ...complete, IDENTITY_EXPERIENCE_PUBLIC_ORIGIN: 'https://id.example.com/' }),
    ).toThrow(/exact origin/);
  });

  it('applies the defaults', () => {
    const config = loadConfig(complete);
    expect(config).toMatchObject({
      listenPort: 8080,
      listenHost: '0.0.0.0',
      logLevel: 'info',
      session: { idleMs: 30 * 60_000, absoluteMs: 8 * 3_600_000, refreshSkewMs: 30_000 },
      identityControlBaseUrl: 'http://identity-control:8080',
      upstreamTimeoutMs: 10_000,
    });
    // The internal address defaults to the issuer: one address for both, the simple deployment.
    expect(config.oidc.internalBaseUrl).toBe(complete.IDENTITY_EXPERIENCE_ISSUER);
  });

  it('refuses a callback other than this origin’s /auth/callback', () => {
    expect(() =>
      loadConfig({ ...complete, IDENTITY_EXPERIENCE_REDIRECT_URI: 'https://id.example.com/elsewhere' }),
    ).toThrow(/must be https:\/\/id\.example\.com\/auth\/callback/);
  });

  it('refuses a plain-HTTP issuer off this machine, and a session key of the wrong size', () => {
    let caught: unknown;
    try {
      loadConfig({
        ...complete,
        IDENTITY_EXPERIENCE_ISSUER: 'http://sso.example.com/realms/scnehaux',
        IDENTITY_EXPERIENCE_SESSION_KEY: Buffer.alloc(16).toString('base64'),
        IDENTITY_EXPERIENCE_SESSION_IDLE: '9h',
      });
    } catch (error) {
      caught = error;
    }
    const problems = (caught as ConfigError).problems.join('\n');
    expect(problems).toContain('must be https unless it is on this machine');
    expect(problems).toContain('32 bytes');
    expect(problems).toContain('must not exceed');
  });
});
