import { expect, type Page } from '@playwright/test';

import { bffOrigin } from '../shared.js';

// signedIn reads the BFF's session the way the applications do, from a page of the BFF's own origin
// in the same browser. Playwright's request context is not used: it does not send a Secure cookie to
// an http:// origin, where Chromium does for a loopback address.
export async function signedIn(page: Page): Promise<boolean> {
  const probe = await page.context().newPage();
  try {
    await probe.goto(`${bffOrigin}/auth/session`);
    return (
      (JSON.parse((await probe.locator('body').textContent()) ?? '{}') as { authenticated?: boolean })
        .authenticated === true
    );
  } finally {
    await probe.close();
  }
}

// signIn signs in from a page through the BFF and the stand-in kernel's hosted login (stack.ts), every
// redirect and cookie the browser's own, and checks the page came back where returnTo says, signed in.
export async function signIn(page: Page, returnTo: string): Promise<void> {
  await page.goto(`/auth/login?return_to=${encodeURIComponent(returnTo)}`);
  expect(new URL(page.url()).origin).toBe(bffOrigin);
  expect(new URL(page.url()).pathname).toBe(returnTo);
  expect(await signedIn(page)).toBe(true);
}
