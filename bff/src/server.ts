import { randomUUID } from 'node:crypto';
import path from 'node:path';

import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import pg from 'pg';

import { apiProxy } from './api/proxy.js';
import { Oidc } from './auth/oidc.js';
import { authRoutes } from './auth/routes.js';
import type { Config } from './config.js';
import { accountPrefix, developerPrefix, isAccountPath, isDeveloperPath } from './http/applications.js';
import { registerCanonicalHost } from './http/canonical-host.js';
import { sendProblem } from './http/problem.js';
import { registerSecurityHeaders } from './http/security-headers.js';
import { Sealer } from './session/seal.js';
import { Sessions } from './session/sessions.js';
import { SessionStore, SessionStoreUnavailable } from './session/store.js';

export interface ServerDependencies {
  // now is the clock sessions expire by. A test moves it; nothing else does.
  readonly now?: () => Date;
}

// How often rows past their expiry are removed. They are refused when presented whether or not
// this has run; it only keeps the tables small.
const purgeIntervalMs = 5 * 60 * 1000;

// Paths the browser application never owns. A miss under one of them is a 404 problem document,
// never the application's index.html, so a mistyped API call fails as an API call.
const reservedPrefixes = ['/api/', '/auth/'];

const isReserved = (url: string): boolean =>
  url === '/api' || url === '/auth' || reservedPrefixes.some((prefix) => url.startsWith(prefix));

// buildServer assembles the BFF. It starts nothing: main.ts listens, and a test injects.
export async function buildServer(
  config: Config,
  dependencies: ServerDependencies = {},
): Promise<FastifyInstance> {
  const now = dependencies.now ?? (() => new Date());
  const app = Fastify({
    logger: { level: config.logLevel },
    // The correlation identifier every problem document and log line carries. Generated, never
    // taken from the request: a caller-chosen identifier could collide with, or impersonate,
    // another request's trail.
    genReqId: () => randomUUID(),
    trustProxy: false,
  });

  registerSecurityHeaders(app);
  registerCanonicalHost(app, config.publicOrigin);

  // The pool connects on first use, so a process whose database is down still starts, serves the
  // application shell and answers its liveness probe; a request that needs a session fails as an
  // outage.
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  pool.on('error', (error) => {
    app.log.error({ err: error }, 'session store connection failed');
  });
  const store = new SessionStore(pool, new Sealer(config.session.key));
  const oidc = new Oidc(config.oidc, now);
  const sessions = new Sessions(store, config.session, oidc, now);

  const purge = setInterval(() => {
    store.purgeExpired(now()).catch((error: unknown) => {
      app.log.warn({ err: error }, 'expired session purge failed');
    });
  }, purgeIntervalMs);
  purge.unref();
  app.addHook('onClose', async () => {
    clearInterval(purge);
    await pool.end();
  });

  await app.register(fastifyCookie);
  await app.register(authRoutes, {
    publicOrigin: config.publicOrigin,
    oidc,
    sessions,
    store,
    now,
    tenantSignIn: config.tenantSignIn,
  });
  await app.register(apiProxy, {
    publicOrigin: config.publicOrigin,
    sessions,
    identityControlBaseUrl: config.identityControlBaseUrl,
    timeoutMs: config.upstreamTimeoutMs,
  });

  app.get('/healthz', async (_request, reply) =>
    reply.header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('ok\n'),
  );

  // The built applications. Hashed assets never change under their name, so they are cached for
  // a year; index.html names the current assets, so it is never cached, and a deploy reaches
  // every browser on its next navigation.
  const setHeaders = (reply: FastifyReply, filePath: string): void => {
    const cache = filePath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-store';
    reply.header('cache-control', cache);
  };
  await app.register(fastifyStatic, {
    root: path.resolve(config.webRoot),
    prefix: '/',
    index: false,
    wildcard: true,
    setHeaders,
  });

  // The Developer Console, when this deployment serves it, under its own prefix and from its own
  // build. The router prefers the longer prefix, so nothing under /developer/ is looked up in the
  // Admin Portal's files.
  const developerRoot = config.developerWebRoot === null ? null : path.resolve(config.developerWebRoot);
  if (developerRoot !== null) {
    await app.register(fastifyStatic, {
      root: developerRoot,
      prefix: developerPrefix,
      index: false,
      wildcard: true,
      decorateReply: false,
      setHeaders,
    });
  }

  // The account security experience, in the same way under /account/.
  const accountRoot = config.accountWebRoot === null ? null : path.resolve(config.accountWebRoot);
  if (accountRoot !== null) {
    await app.register(fastifyStatic, {
      root: accountRoot,
      prefix: accountPrefix,
      index: false,
      wildcard: true,
      decorateReply: false,
      setHeaders,
    });
  }

  // sendShell answers with the shell of the application a page path belongs to.
  const sendShell = (url: string, reply: FastifyReply): FastifyReply => {
    reply.header('cache-control', 'no-store');
    if (developerRoot !== null && isDeveloperPath(url)) {
      return reply.sendFile('index.html', developerRoot);
    }
    if (accountRoot !== null && isAccountPath(url)) {
      return reply.sendFile('index.html', accountRoot);
    }
    return reply.sendFile('index.html');
  };

  // An application's root is the one page the static handler cannot answer: to it, "/" is a
  // directory, and a directory with no index is refused. So the shell is served for it explicitly.
  app.get('/', async (request, reply) => sendShell(request.url, reply));
  if (developerRoot !== null) {
    app.get(developerPrefix, async (request, reply) => sendShell(request.url, reply));
    // One address for the console's root: its shell is at /developer/.
    app.get(developerPrefix.slice(0, -1), async (_request, reply) =>
      reply.header('cache-control', 'no-store').redirect(developerPrefix, 308),
    );
  }

  if (accountRoot !== null) {
    app.get(accountPrefix, async (request, reply) => sendShell(request.url, reply));
    app.get(accountPrefix.slice(0, -1), async (_request, reply) =>
      reply.header('cache-control', 'no-store').redirect(accountPrefix, 308),
    );
  }

  // Client-side routes: any other GET that asks for a page gets the shell of the application it
  // belongs to, and that application's router decides. Anything else is a 404 problem document.
  app.setNotFoundHandler(async (request, reply) => {
    const acceptsPage = (request.headers.accept ?? '').includes('text/html');
    if (request.method === 'GET' && acceptsPage && !isReserved(request.url)) {
      return sendShell(request.url, reply);
    }
    return sendProblem(request, reply, 'notFound');
  });

  // A client error raised inside a plugin (a refused path, a malformed range) is the client's, and
  // answers as one: reporting it as 500 would page an operator for a mistyped URL.
  app.setErrorHandler(async (error, request, reply) => {
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      // The static handler refuses a directory with 403: to a caller it is a path with nothing there.
      const missing = status === 403 || status === 404 || status === 405;
      return sendProblem(request, reply, missing ? 'notFound' : 'validationFailed');
    }
    // A session store that does not answer, on a path that did not answer it itself (the proxy
    // ending a session the API refused), is an outage, not a fault: 503, as everywhere else
    // (TDD-identity-experience-001 §Session-Store Outage).
    if (error instanceof SessionStoreUnavailable) {
      request.log.error({ err: error }, 'session store unavailable');
      return sendProblem(request, reply, 'dependencyUnavailable');
    }
    request.log.error({ err: error }, 'request failed');
    return sendProblem(request, reply, 'internal');
  });

  return app;
}
