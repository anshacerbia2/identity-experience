import { randomUUID } from 'node:crypto';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Config } from './config.js';
import { sendProblem } from './http/problem.js';
import { registerSecurityHeaders } from './http/security-headers.js';

// Paths the browser application never owns. A miss under one of them is a 404 problem document,
// never the application's index.html, so a mistyped API call fails as an API call.
const reservedPrefixes = ['/api/', '/auth/'];

const isReserved = (url: string): boolean =>
  url === '/api' || url === '/auth' || reservedPrefixes.some((prefix) => url.startsWith(prefix));

// buildServer assembles the BFF. It starts nothing: main.ts listens, and a test injects.
export async function buildServer(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    // The correlation identifier every problem document and log line carries. Generated, never
    // taken from the request: a caller-chosen identifier could collide with, or impersonate,
    // another request's trail.
    genReqId: () => randomUUID(),
    trustProxy: false,
  });

  registerSecurityHeaders(app);

  app.get('/healthz', async (_request, reply) =>
    reply.header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('ok\n'),
  );

  // The built application. Hashed assets never change under their name, so they are cached for
  // a year; index.html names the current assets, so it is never cached, and a deploy reaches
  // every browser on its next navigation.
  await app.register(fastifyStatic, {
    root: path.resolve(config.webRoot),
    prefix: '/',
    index: false,
    wildcard: true,
    setHeaders: (reply, filePath) => {
      const cache = filePath.includes(`${path.sep}assets${path.sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'no-store';
      reply.header('cache-control', cache);
    },
  });

  // The root is the one page the static handler cannot answer: to it, "/" is a directory, and a
  // directory with no index is refused. So the shell is served for it explicitly.
  app.get('/', async (_request, reply) => reply.header('cache-control', 'no-store').sendFile('index.html'));

  // Client-side routes: any other GET that asks for a page gets the application shell, and the
  // router decides. Anything else is a 404 problem document.
  app.setNotFoundHandler(async (request, reply) => {
    const acceptsPage = (request.headers.accept ?? '').includes('text/html');
    if (request.method === 'GET' && acceptsPage && !isReserved(request.url)) {
      return reply.header('cache-control', 'no-store').sendFile('index.html');
    }
    return sendProblem(request, reply, 'notFound');
  });

  // A client error raised inside a plugin (a refused path, a malformed range) is the client's, and
  // answers as one: reporting it as 500 would page an operator for a mistyped URL.
  app.setErrorHandler(async (error, request, reply) => {
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return sendProblem(request, reply, status === 400 ? 'validationFailed' : 'notFound');
    }
    request.log.error({ err: error }, 'request failed');
    return sendProblem(request, reply, 'internal');
  });

  return app;
}
