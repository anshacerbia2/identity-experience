// axe in Chromium on each main page of the three applications, rendered by the BFF from the built
// bundles, with their data (TDD-identity-experience-003 §Accessibility in a Browser). The component
// tests run axe in jsdom, which has no layout; here Chromium lays the pages out, so the rules that need
// layout and computed style run too. This is automated evidence only. Playwright's guidance: "automated
// testing cannot detect all types of WCAG violations". Keyboard order, focus, zoom, colour contrast
// and a screen reader need the manual audit.
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
  { path: '/principals', ready: (page) => page.getByRole('textbox', { name: 'Username or email' }) },
  {
    path: `/principals/${subjectPrincipal}`,
    ready: (page) => page.getByRole('heading', { name: 'alice' }),
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
    ready: (page) => page.getByRole('button', { name: 'Read the report' }),
    open: async (page) => {
      await page.getByRole('button', { name: 'Read the report' }).click();
      await page.getByRole('region', { name: 'The report an operator posts' }).waitFor();
    },
  },
  { path: '/developer/', ready: (page) => page.getByRole('heading', { level: 1 }) },
  { path: '/account/', ready: (page) => page.getByText('Where you are signed in').first() },
];

test.beforeEach(async ({ page }) => {
  await signIn(page, '/');
});

for (const main of pages) {
  test(`${main.path} has no WCAG A or AA violation axe finds in Chromium`, async ({ page }) => {
    await page.goto(main.path);
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
    // it, and axe does not compute a background it cannot resolve to one colour.
    for (const undecided of results.incomplete) {
      test.info().annotations.push({
        type: 'needs review',
        description: `${undecided.id}: ${String(undecided.nodes.length)} node(s)`,
      });
    }
  });
}
