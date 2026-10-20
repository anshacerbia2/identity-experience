import { expect, type Page } from '@playwright/test';

import { bffOrigin, orphanPrincipal } from '../shared.js';

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

// planAdoption opens an orphan's adoption on the Principals page and plans it. The stand-in API refuses
// every command, so the plan is answered here: what is checked is the panel with its four checks shown,
// not the command (TDD-identity-experience-003 1.32.0 §Adopting an Orphan's Identifier).
export async function planAdoption(page: Page): Promise<void> {
  await page.route('**/api/v1/principals/*:adopt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({
        principal_id: orphanPrincipal,
        adoptable: false,
        refusal:
          'creation_on_record: no admin event records this service creating the user with this identifier; its creation may be past the kernel’s event retention, and triage decides',
        checks: [
          { check: 'orphan_finding', holds: true, detail: 'an open orphan finding claims it' },
          { check: 'one_kernel_user', holds: true, detail: 'exactly one kernel user carries it, a person' },
          {
            check: 'newer_than_backup',
            holds: true,
            detail: 'its time 2026-10-20T09:12:44Z is later than the newest mapping, 2026-10-20T02:00:00Z',
          },
          {
            check: 'creation_on_record',
            holds: false,
            detail:
              'no admin event records this service creating the user with this identifier; its creation may be past the kernel’s event retention, and triage decides',
          },
        ],
        adopted: false,
      }),
    }),
  );
  await page.getByRole('button', { name: 'Adopt identifier' }).click();
  await page
    .getByRole('textbox', { name: /reason/i })
    .last()
    .fill('Restore to 02:00 after INC-12, runbook step 6');
  await page.getByRole('button', { name: 'Plan the adoption' }).click();
  await page.getByRole('table', { name: 'The four checks an adoption needs' }).waitFor();
}
