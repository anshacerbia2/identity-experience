import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConfigError, loadConfig, type Config } from '../src/config.js';
import { contentSecurityPolicy, securityHeaders } from '../src/http/security-headers.js';
import { buildServer } from '../src/server.js';

let app: FastifyInstance;

beforeAll(async () => {
  const webRoot = mkdtempSync(path.join(tmpdir(), 'bff-web-'));
  mkdirSync(path.join(webRoot, 'assets'));
  writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
  writeFileSync(path.join(webRoot, 'assets', 'app-3f9a.js'), 'export {};');
  const config: Config = {
    listenHost: '127.0.0.1',
    listenPort: 8080,
    webRoot,
    publicOrigin: 'https://id.example.com',
    logLevel: 'fatal',
  };
  app = await buildServer(config);
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
      { url: '/api/v1/nothing' },
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
    for (const url of ['/api/v1/nothing', '/auth/nothing', '/api']) {
      const response = await app.inject({ method: 'GET', url, headers: page });
      expect(response.statusCode, url).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      const body = response.json<{ type: string; correlation_id: string; instance: string }>();
      expect(body.type).toBe('https://problems.scnehaux.com/not-found');
      expect(body.correlation_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.instance).toBe(url);
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

  it('refuses an origin with a path or trailing slash', () => {
    expect(() =>
      loadConfig({
        IDENTITY_EXPERIENCE_PUBLIC_ORIGIN: 'https://id.example.com/',
        IDENTITY_EXPERIENCE_WEB_ROOT: '.',
      }),
    ).toThrow(/exact origin/);
  });

  it('applies the defaults', () => {
    const config = loadConfig({
      IDENTITY_EXPERIENCE_PUBLIC_ORIGIN: 'https://id.example.com',
      IDENTITY_EXPERIENCE_WEB_ROOT: './web/dist',
    });
    expect(config).toMatchObject({ listenPort: 8080, listenHost: '0.0.0.0', logLevel: 'info' });
  });
});
