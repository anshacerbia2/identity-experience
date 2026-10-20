// axe in Chromium on each main page of the three applications, rendered by the BFF from the built
// bundles, with their data, in the dark and the light theme (TDD-identity-experience-003
// §Accessibility in a Browser). The component tests run axe in jsdom, which has no layout; here
// Chromium lays the pages out, so the rules that need layout and computed style run too. This is
// automated evidence only. Playwright's guidance: "automated testing cannot detect all types of WCAG
// violations". Keyboard order, focus, zoom, colour contrast and a screen reader need the manual audit.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { registrationId, subjectPrincipal } from '../shared.js';
import { signIn } from './support.js';

// The WCAG 2.0, 2.1 and 2.2 A and AA rules axe implements.
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface Main {
  readonly path: string;
  // ready is something the page shows once its reads have answered.
  readonly ready: (page: Page) => ReturnType<Page['getByRole']>;
  // open, when set, opens what the page reads only on request, so it is checked too.
  readonly open?: (page: Page) => Promise<void>;
}

const pages: readonly Main[] = [
  { path: '/', ready: (page) => page.getByRole('heading', { level: 1 }) },
  {
    path: '/principals',
    ready: (page) => page.getByRole('textbox', { name: 'Username or email' }),
    open: async (page) => {
      await page.getByRole('button', { name: 'Show the quarantined Principals' }).click();
      await page.getByRole('table', { name: 'Quarantined Principals, oldest first' }).waitFor();
      await page.getByRole('button', { name: 'Show the pending Principals' }).click();
      await page.getByRole('table', { name: 'Pending Principals, oldest first' }).waitFor();
    },
  },
  {
    path: `/principals/${subjectPrincipal}`,
    ready: (page) => page.getByRole('heading', { name: 'alice' }),
    // A temporary password shown once (TDD-identity-experience-003 1.28.0). The stand-in API refuses
    // every command, so the browser's one command is answered here: what is checked is the panel as it
    // is laid out with a value shown, not the command.
    open: async (page) => {
      await page.route('**/api/v1/principals/*:issue-temporary-password', (route) =>
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          headers: { 'cache-control': 'no-store' },
          body: JSON.stringify({
            temporary_password: {
              issuance_id: '0192f0e0-7777-7000-8000-000000000001',
              principal_id: subjectPrincipal,
              issued_at: new Date().toISOString(),
              lapses_at: new Date(Date.now() + 86_400_000).toISOString(),
              value: 'K7QH2M9XRT4WZP6VDN3BC8FA',
            },
          }),
        }),
      );
      await page.getByRole('button', { name: 'Issue a new temporary password' }).click();
      await page.getByRole('textbox', { name: /reason/i }).fill('new joiner, verified on a call');
      await page.getByRole('button', { name: 'Issue', exact: true }).click();
      await page.getByText('K7QH2M9XRT4WZP6VDN3BC8FA').waitFor();
    },
  },
  { path: '/workloads', ready: (page) => page.getByRole('heading', { level: 1 }) },
  { path: '/registrations', ready: (page) => page.getByRole('link', { name: 'billing-portal' }) },
  {
    path: `/registrations/${registrationId}`,
    ready: (page) => page.getByRole('heading', { name: 'billing-portal' }),
  },
  { path: '/changes', ready: (page) => page.getByRole('heading', { level: 1 }) },
  { path: '/emergency-grants', ready: (page) => page.getByRole('table', { name: /Emergency grants/ }) },
  {
    path: '/projections',
    ready: (page) => page.getByRole('table', { name: 'Tenants not converged, oldest mark first' }),
    open: async (page) => {
      await page.getByRole('button', { name: 'Read the report' }).click();
      await page.getByRole('region', { name: 'The report an operator posts' }).waitFor();
    },
  },
  { path: '/developer/', ready: (page) => page.getByRole('heading', { level: 1 }) },
  {
    path: '/account/',
    ready: (page) => page.getByText('Where you are signed in').first(),
    // An address in use but not proven, with its code field open (TDD-identity-experience-002 1.10.0).
    open: async (page) => {
      await page.getByText('In use, not proven').waitFor();
    },
  },
];

test.beforeEach(async ({ page }) => {
  await signIn(page, '/');
});

// Both themes the applications offer. The theme is the viewer's stored preference, read before the
// first render (packages/app-core preferences-store), so each page opens in it.
const themes = ['dark', 'light'] as const;
type Theme = (typeof themes)[number];

async function useTheme(page: Page, theme: Theme): Promise<void> {
  const stored = JSON.stringify({ state: { theme, locale: 'en' }, version: 0 });
  await page.addInitScript({
    content: `window.localStorage.setItem('scnx-iam-preferences', ${JSON.stringify(stored)});`,
  });
}

for (const theme of themes) {
  for (const main of pages) {
    test(`${main.path} has no WCAG A or AA violation axe finds in Chromium, ${theme} theme`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.goto(main.path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(main.ready(page)).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      if (main.open !== undefined) {
        await main.open(page);
      }
      const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
      const violations = results.violations.map((violation) => ({
        rule: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target.join(' ')),
      }));
      expect(violations).toEqual([]);
      // What axe could not decide is left for the manual audit, and said so in the report. Colour
      // contrast is among it: the canvas is painted with gradients and the panels are translucent over
      // it, and axe does not compute a background it cannot resolve to one colour. The pairs are
      // computed instead, after alpha composition (packages/ui src/styles/contrast.test.ts).
      for (const undecided of results.incomplete) {
        test.info().annotations.push({
          type: 'needs review',
          description: `${theme}: ${undecided.id}: ${String(undecided.nodes.length)} node(s)`,
        });
      }
    });
  }

  // Focus is an outline on a field and on a button, reached from the keyboard, and stays one under
  // forced colours, where a box-shadow is computed as none (STD-GLB-FE-005 §3.9 and §5).
  for (const forcedColors of ['none', 'active'] as const) {
    test(`a field and a button show focus as an outline, ${theme} theme, forced colours ${forcedColors}`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.emulateMedia({ forcedColors });
      await page.goto('/principals');
      const field = page.getByRole('textbox', { name: 'Username or email' });
      await expect(field).toBeVisible();
      // The selectors match only an element the browser shows focus on, so each assertion is about
      // the indicator a keyboard user sees.
      const ring = async (focused: ReturnType<Page['locator']>): Promise<void> => {
        await expect(focused).toHaveCount(1);
        await expect(focused).toHaveCSS('outline-style', 'solid');
        await expect(focused).toHaveCSS('outline-width', '2px');
        await expect(focused).toHaveCSS('outline-offset', '2px');
      };
      await field.focus();
      await ring(page.locator('input:focus-visible'));
      await page.keyboard.press('Tab');
      await ring(page.locator('button[data-variant]:focus-visible'));
    });
  }

  // The language in use is a pressed toggle, shown by an edge the other has not, not by colour alone
  // (WCAG 2.2 SC 1.4.1 and SC 1.4.11).
  test(`a pressed toggle shows by its edge, ${theme} theme`, async ({ page }) => {
    await useTheme(page, theme);
    await page.goto('/');
    const pressed = page.getByRole('button', { name: 'EN', pressed: true });
    const other = page.getByRole('button', { name: 'ID', pressed: false });
    await expect(other).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    await expect(pressed).toHaveCSS('border-top-style', 'solid');
    await expect(pressed).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  });

  // A link is underlined at rest, so it is told from the text around it by more than its colour
  // (WCAG 2.2 SC 1.4.1): one the page styles itself, and one left to the foundations.
  test(`a link is underlined, ${theme} theme`, async ({ page }) => {
    await useTheme(page, theme);
    await page.goto('/registrations');
    const styled = page.getByRole('link', { name: 'billing-portal' });
    await expect(styled).toHaveCSS('text-decoration-line', 'underline');
    await page.goto(`/principals/${subjectPrincipal}`);
    await expect(page.getByRole('heading', { name: 'alice' })).toBeVisible();
    const plain = page.getByRole('main').getByRole('link', { name: 'Principals', exact: true });
    await expect(plain).toHaveCSS('text-decoration-line', 'underline');
  });
}
