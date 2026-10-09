// What the stack (stack.ts) and the browser tests agree on: where each server listens. The BFF is the
// one origin the applications are served from, as on a laptop. The foreign site is another site to
// the browser: its host is not the BFF's, and Chromium resolves it to the loopback address
// (playwright.config.ts), so a page there is cross-site to the BFF as an attacker's page would be.
export const bffPort = Number(process.env.E2E_BFF_PORT ?? '18471');
export const auxPort = Number(process.env.E2E_AUX_PORT ?? '18472');

export const bffOrigin = `http://127.0.0.1:${bffPort}`;
export const foreignHost = 'foreign.example';
export const foreignOrigin = `http://${foreignHost}:${auxPort}`;
// The stand-in kernel's issuer, on the same server as the foreign pages but under the loopback address.
export const controlOrigin = `http://127.0.0.1:${auxPort}`;

export const sessionCookie = '__Host-ident_session';

// The Principal the stand-in kernel signs in, and another one the fixtures name.
export const operatorPrincipal = 'prn_01TESTPRINCIPAL';
export const subjectPrincipal = '0192f0e0-3333-7000-8000-000000000007';
export const registrationId = '0192f0e0-1111-7000-8000-000000000001';
