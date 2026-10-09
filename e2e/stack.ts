// The stack the browser tests run against, as a laptop runs it: this repository's BFF, built from
// bff/src, serving the three built applications on one origin, with its session store in PostgreSQL.
// Around it, stand-ins for what it calls: bff/test/support's identity kernel (the protocol, PS256,
// private_key_jwt, PKCE), and an Identity Control API that answers every read with fixtures. Nothing
// here changes what the BFF or an application does; the stand-ins only answer.
//
// Beside them, one more server: the stand-in kernel's hosted login, where the person signing in is
// played, and, under a host that is another site to the browser, the pages an attacker would serve.
//
// IDENTITY_EXPERIENCE_TEST_DATABASE_URL names the PostgreSQL the BFF's own tests use; the stack makes
// a schema of its own there and drops it when it stops.
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { fixture } from './fixtures.js';
import { auxPort, bffOrigin, bffPort, controlOrigin, foreignOrigin } from './shared.js';
import { buildServer } from '../bff/src/server.js';
import { testClientKey } from '../bff/test/support/client-key.js';
import { createTestDatabase } from '../bff/test/support/database.js';
import { IdentityProvider } from '../bff/test/support/identity-provider.js';

// The stand-in kernel writes its client key file under the temporary directory the config names.
mkdirSync(tmpdir(), { recursive: true });

const root = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));

const send = (response: ServerResponse, status: number, body: string, type: string): void => {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(body);
};

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const listen = (server: ReturnType<typeof createServer>, port: number): Promise<number> =>
  new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : port);
    });
  });

// The Identity Control API: every GET answered from fixtures.ts, every POST refused as the API
// refuses a command it cannot take, so no test passes on a command the stand-in pretended to apply.
const api = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://api');
  const answer = request.method === 'GET' ? fixture(url.pathname) : undefined;
  if (answer === undefined) {
    send(
      response,
      404,
      JSON.stringify({ type: 'https://problems.scnehaux.com/not-found', title: 'Not Found', status: 404 }),
      'application/problem+json',
    );
    return;
  }
  send(response, 200, JSON.stringify(answer), 'application/json');
});
const apiPort = await listen(api, 0);

// The stand-in kernel is reached through the auxiliary server, which serves its hosted login: the
// person signing in is played there, and the browser is redirected back to the BFF with the code, as
// the kernel's page redirects it. Every other kernel endpoint is passed through. The issuer names the
// auxiliary server, so the tokens, the client assertions' audience and the browser agree on it.
const provider = new IdentityProvider();
await provider.start();
const kernelOrigin = new URL(provider.issuer).origin;
provider.issuer = `${controlOrigin}/realms/test`;
const database = await createTestDatabase();

const bff = await buildServer({
  listenHost: '127.0.0.1',
  listenPort: bffPort,
  webRoot: root('apps/admin/dist'),
  developerWebRoot: root('apps/developer/dist'),
  accountWebRoot: root('apps/account/dist'),
  publicOrigin: bffOrigin,
  logLevel: 'warn',
  oidc: {
    issuer: provider.issuer,
    internalBaseUrl: provider.issuer,
    clientId: provider.clientId,
    clientKey: testClientKey().key,
    redirectUri: `${bffOrigin}/auth/callback`,
  },
  session: { idleMs: 30 * 60_000, absoluteMs: 8 * 3_600_000, refreshSkewMs: 30_000, key: randomBytes(32) },
  identityControlBaseUrl: `http://127.0.0.1:${apiPort}`,
  upstreamTimeoutMs: 5_000,
  tenantSignIn: false,
  databaseUrl: database.url,
});
await bff.listen({ host: '127.0.0.1', port: bffPort });

// The foreign site's pages, each a cross-site request to the BFF a browser makes on a page's behalf:
//   /form-post    a form that posts itself to the BFF's sign-out, as a forged command would
//   /fetch-post   a credentialed fetch() that posts to the API through the BFF
//   /frame        the BFF's session read inside an iframe
//   /link         a link to the BFF's session read, followed at the top level
// and, under /realms/test/, the stand-in kernel.
const pages: Readonly<Record<string, string>> = {
  '/form-post': `<form method="post" action="${bffOrigin}/auth/logout"></form>
<script>document.forms[0].submit()</script>`,
  '/fetch-post': `<script>
fetch('${bffOrigin}/api/v1/principals', { method: 'POST', mode: 'no-cors', credentials: 'include',
  headers: { 'content-type': 'text/plain' }, body: '{}' })
  .finally(() => { document.title = 'sent' })
</script>`,
  '/frame': `<iframe src="${bffOrigin}/auth/session" title="session"></iframe>`,
  '/link': `<a href="${bffOrigin}/auth/session">session</a>`,
};

const aux = createServer((request, response) => {
  const url = new URL(request.url ?? '/', controlOrigin);
  if (request.method === 'GET' && url.pathname === '/realms/test/protocol/openid-connect/auth') {
    // The person signs in on the hosted page: the stand-in checks the authorization request and
    // issues a code for the redirect URI it named.
    try {
      const query = provider.authorize(`${controlOrigin}${url.pathname}${url.search}`);
      response.writeHead(302, { location: `${url.searchParams.get('redirect_uri') ?? ''}${query}` });
      response.end();
    } catch (error) {
      send(response, 400, String(error), 'text/plain');
    }
    return;
  }
  if (url.pathname.startsWith('/realms/test/')) {
    void readBody(request)
      .then(async (body) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (typeof value === 'string' && name !== 'host' && name !== 'content-length') {
            headers.set(name, value);
          }
        }
        const answer = await fetch(`${kernelOrigin}${url.pathname}${url.search}`, {
          method: request.method ?? 'GET',
          headers,
          ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body }),
        });
        const passed = [...answer.headers.entries()].filter(
          ([name]) =>
            !['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(name),
        );
        response.writeHead(answer.status, Object.fromEntries(passed));
        response.end(Buffer.from(await answer.arrayBuffer()));
      })
      .catch((error: unknown) => {
        send(response, 502, String(error), 'text/plain');
      });
    return;
  }
  const page = pages[url.pathname];
  if (request.method === 'GET' && page !== undefined) {
    send(response, 200, `<!doctype html><html lang="en"><title>foreign</title>${page}</html>`, 'text/html');
    return;
  }
  send(response, 404, 'not found', 'text/plain');
});
await listen(aux, auxPort);

process.stdout.write(`stack ready: BFF ${bffOrigin}, foreign site ${foreignOrigin}\n`);

let stopping = false;
const stop = async (): Promise<void> => {
  if (stopping) {
    return;
  }
  stopping = true;
  await bff.close();
  await Promise.all([
    provider.stop(),
    new Promise((resolve) => api.close(resolve)),
    new Promise((resolve) => aux.close(resolve)),
  ]);
  await database.drop();
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
