// The enrolment page in Chromium, as the person it is for meets it: not signed in, from the link
// organization-experience's "I do not have an account" opens, the invitation token in the fragment
// (TDD-identity-experience-001 1.24.0 §Enrolment From an Invitation; ADR-IAM-011 §5.1 to §5.3). The BFF
// is the real one, calling the stand-in Identity Control API as its enrolment workload (stack.ts).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';

import { bffOrigin, enrolmentCode, foreignOrigin, invitationToken } from '../shared.js';
import { signedIn } from './support.js';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function noViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

// The page's own content, which reaches past no edge of a 320 CSS px viewport.
async function fits(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('a person with no account enrols from the link, and sees the temporary password once', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const requests: Request[] = [];
  page.on('request', (request) => {
    requests.push(request);
  });

  const shell = await page.goto(`/account/enrol#${encodeURIComponent(invitationToken)}`);
  expect(await signedIn(page)).toBe(false);
  // The token left the address bar before anything read it, and no request named it in its URL.
  await expect(page.getByRole('button', { name: 'Send me a code' })).toBeVisible();
  expect(page.url()).toBe(`${bffOrigin}/account/enrol`);
  // The shell is never cached, and its policy runs no inline or evaluated script.
  expect(shell?.headers()['cache-control']).toBe('no-store');
  const policy = shell?.headers()['content-security-policy'] ?? '';
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toContain('unsafe-inline');
  expect(policy).not.toContain('unsafe-eval');
  expect(shell?.headers()['referrer-policy']).toBe('no-referrer');
  await noViolations(page);
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath('enrolment-start-320.png'), fullPage: true });

  const [sent] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/auth/enrolment'),
    page.getByRole('button', { name: 'Send me a code' }).click(),
  ]);
  expect(sent.status()).toBe(202);
  expect(sent.headers()['cache-control']).toBe('no-store');
  const ask = sent.request();
  expect(ask.headers()['content-type']).toBe('application/json');
  expect(ask.headers()['referer'] ?? '').toBe('');
  expect(await ask.headerValue('origin')).toBe(bffOrigin);
  expect(await ask.headerValue('sec-fetch-site')).toBe('same-origin');
  expect(ask.postDataJSON()).toEqual({ token: invitationToken });
  await expect(
    page.getByText(
      'If this invitation can still be used, a code is on its way to the address it was sent to. It is good for 10 minutes.',
    ),
  ).toBeVisible();
  await noViolations(page);
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath('enrolment-code-320.png'), fullPage: true });

  // A wrong code: the one refusal, and the form stays.
  await page.getByRole('textbox', { name: 'Code' }).fill('00000000');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'The code is wrong, has expired, or has been tried too often. Start again from the invitation link.',
  );
  await noViolations(page);
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath('enrolment-refused-320.png'), fullPage: true });

  // Start again from the link's token, still in the page's memory, and return the right code.
  await page.getByRole('button', { name: 'Start again' }).click();
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await page.getByRole('textbox', { name: 'Code' }).fill(enrolmentCode);
  const [created] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/auth/enrolment/verify'),
    page.getByRole('button', { name: 'Create my account' }).click(),
  ]);
  expect(created.status()).toBe(201);
  expect(created.headers()['cache-control']).toBe('no-store');
  await expect(page.getByText('K7QH2M9XRT4WZP6VDN3BC8FA')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute(
    'href',
    '/auth/login?return_to=%2Faccount%2F',
  );
  await noViolations(page);
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath('enrolment-created-320.png'), fullPage: true });

  // Nothing the page holds reached a URL, or browser storage.
  for (const request of requests) {
    expect(request.url()).not.toContain(invitationToken);
    expect(request.url()).not.toContain('K7QH2M9XRT4WZP6VDN3BC8FA');
  }
  const stored = await page.evaluate(() =>
    [window.sessionStorage, window.localStorage]
      .flatMap((storage) =>
        Array.from({ length: storage.length }, (_, index) => storage.getItem(storage.key(index) ?? '')),
      )
      .join(' '),
  );
  expect(stored).not.toContain(invitationToken);
  expect(stored).not.toContain('K7QH2M9XRT4WZP6VDN3BC8FA');

  // Leaving the page and coming back shows nothing again: the password is not kept.
  await page.reload();
  await expect(page.getByText('Open the link from your invitation')).toBeVisible();
  await expect(page.getByText('K7QH2M9XRT4WZP6VDN3BC8FA')).toHaveCount(0);
});

// A page on another site cannot send the enrolment request: a simple cross-site post is refused before
// the BFF reads it, so it reaches identity-control as nothing (TDD-identity-experience-001 1.24.0
// §Forgery Defences Without a Session).
test('a cross-site page cannot ask for a code', async ({ page }) => {
  await page.goto(`${foreignOrigin}/link`);
  const status = await page.evaluate(async (target) => {
    try {
      const response = await fetch(`${target}/auth/enrolment`, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ token: 'inv_forged' }),
      });
      return response.type;
    } catch {
      return 'failed';
    }
  }, bffOrigin);
  // The foreign page reads nothing of it: the BFF's Cross-Origin-Resource-Policy: same-origin makes the
  // browser fail a cross-origin no-cors read.
  expect(status).toBe('failed');
  const refused = await page.context().request.post(`${bffOrigin}/auth/enrolment`, {
    headers: { origin: foreignOrigin, 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
    data: { token: 'inv_forged' },
  });
  expect(refused.status()).toBe(403);
});
