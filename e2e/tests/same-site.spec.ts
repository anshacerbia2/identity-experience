// SameSite=Lax as the browser enforces it (TDD-identity-experience-001 §Cross-Site Request Forgery).
// bff/test/containment.test.ts proves each forgery defence refuses on its own, with the session cookie's
// absence from a cross-site post simulated; here Chromium decides whether the cookie goes. MDN: Lax
// sends the cookie cross-site only for a top-level navigation with a safe method, excluding fetch(),
// subresources and navigations inside an iframe, and excluding POST.
import { expect, test, type Page, type Request } from '@playwright/test';

import { bffOrigin, foreignOrigin, sessionCookie } from '../shared.js';
import { signedIn, signIn } from './support.js';

// carriesSession reports whether the browser sent the session cookie on a request, from the headers
// Chromium actually sent, cookies included.
async function carriesSession(request: Request): Promise<boolean> {
  const cookie = (await request.allHeaders())['cookie'] ?? '';
  return cookie.split(/;\s*/).some((pair) => pair.startsWith(`${sessionCookie}=`));
}

// toBff waits for the browser's next request to the BFF at a path.
const toBff = (page: Page, path: string, method: string): Promise<Request> =>
  page.waitForRequest((request) => request.url() === `${bffOrigin}${path}` && request.method() === method);

test.beforeEach(async ({ page }) => {
  await signIn(page, '/account/');
});

test('the session cookie is set HttpOnly, Secure, SameSite=Lax and host-only', async ({ context }) => {
  // Every cookie the browser holds: filtering by an http:// URL would leave out a Secure one.
  const cookie = (await context.cookies()).find((c) => c.name === sessionCookie);
  expect(cookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    domain: '127.0.0.1',
  });
});

test('a cross-site form post carries no session cookie, and the session outlives it', async ({ page }) => {
  const sent = toBff(page, '/auth/logout', 'POST');
  await page.goto(`${foreignOrigin}/form-post`);
  const request = await sent;
  expect(await carriesSession(request)).toBe(false);
  expect((await request.response())?.status()).toBeGreaterThanOrEqual(400);
  expect(await signedIn(page)).toBe(true);
});

test('a same-site post carries it: the cookie is held, and only the site decides', async ({ page }) => {
  const sent = toBff(page, '/api/v1/principals', 'POST');
  await page.evaluate(() =>
    fetch('/api/v1/principals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  expect(await carriesSession(await sent)).toBe(true);
  expect(await signedIn(page)).toBe(true);
});

test('a cross-site fetch() post carries no session cookie', async ({ page }) => {
  const sent = toBff(page, '/api/v1/principals', 'POST');
  await page.goto(`${foreignOrigin}/fetch-post`);
  expect(await carriesSession(await sent)).toBe(false);
  await expect(page).toHaveTitle('sent');
  expect(await signedIn(page)).toBe(true);
});

test('a cross-site iframe carries no session cookie', async ({ page }) => {
  const sent = toBff(page, '/auth/session', 'GET');
  await page.goto(`${foreignOrigin}/frame`);
  expect(await carriesSession(await sent)).toBe(false);
});

test('a cross-site top-level link carries it, as Lax allows a safe navigation', async ({ page }) => {
  await page.goto(`${foreignOrigin}/link`);
  const sent = toBff(page, '/auth/session', 'GET');
  await page.getByRole('link', { name: 'session' }).click();
  expect(await carriesSession(await sent)).toBe(true);
  await expect(page.locator('body')).toContainText('"authenticated":true');
});
