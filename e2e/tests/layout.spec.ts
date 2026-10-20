// Layout in Chromium at the widths a person uses, in both themes, with long content
// (TDD-identity-experience-003 §Layout): no panel collapses to a sliver, no text is laid out one
// character per line, and the page does not scroll sideways. jsdom has no layout, so this is checked
// here. A full-page screenshot of each width is kept with the test's output, for review.
import { expect, test, type Page } from '@playwright/test';

import { registrationId, subjectPrincipal } from '../shared.js';
import { signIn } from './support.js';

const widths = [1440, 1280, 1024, 768, 390, 320] as const;
const themes = ['dark', 'light'] as const;

// 16rem, at the 16px root size: a panel narrower than this, with room for more, is collapsed.
const panelFloor = 256;

interface Main {
  readonly name: string;
  readonly path: string;
  readonly ready: (page: Page) => ReturnType<Page['getByRole']>;
  // open shows what the page shows only on request: the confirmations and the forms inside a panel.
  readonly open?: (page: Page) => Promise<void>;
}

const answer = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  headers: { 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

const pages: readonly Main[] = [
  {
    name: 'account',
    path: '/account/',
    ready: (page) => page.getByText('Where you are signed in').first(),
    // Every confirmation and form the page opens inside a panel: signing out everywhere, removing an
    // authenticator, and a code sent to an address in use but not proven (#56).
    open: async (page) => {
      await page.route('**/api/v1/me/notification-addresses/*:send-proof', (route) =>
        route.fulfill(
          answer({
            notification_address: {
              address_id: '0192f0e0-aaaa-7000-8000-000000000002',
              channel: 'email',
              address: 'ada@work.example',
              origin: 'creation',
              state: 'active',
              added_at: new Date().toISOString(),
              proof_expires_at: new Date(Date.now() + 600_000).toISOString(),
            },
          }),
        ),
      );
      await page.getByRole('button', { name: 'Sign out everywhere' }).click();
      // Attached, not visible: a collapsed panel lays its heading out with no width, and that is what
      // is measured below.
      await page
        .getByRole('heading', { name: 'Sign out everywhere, this browser included' })
        .waitFor({ state: 'attached' });
      await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
      await page.getByRole('heading', { name: /^Remove this/ }).waitFor({ state: 'attached' });
      await page.getByRole('button', { name: 'Send a code' }).first().click();
      await page.getByRole('status').filter({ hasText: /sent/i }).first().waitFor();
    },
  },
  {
    name: 'principal',
    path: `/principals/${subjectPrincipal}`,
    ready: (page) => page.getByRole('heading', { name: 'alice' }),
    // A temporary password shown once (#56), and a containment form inside its panel.
    open: async (page) => {
      await page.route('**/api/v1/principals/*:issue-temporary-password', (route) =>
        route.fulfill(
          answer({
            temporary_password: {
              issuance_id: '0192f0e0-7777-7000-8000-000000000001',
              principal_id: subjectPrincipal,
              issued_at: new Date().toISOString(),
              lapses_at: new Date(Date.now() + 86_400_000).toISOString(),
              value: 'K7QH2M9XRT4WZP6VDN3BC8FA',
            },
          }),
        ),
      );
      await page.getByRole('button', { name: 'Issue a new temporary password' }).click();
      await page.getByRole('textbox', { name: /reason/i }).fill('new joiner, verified on a call');
      await page.getByRole('button', { name: 'Issue', exact: true }).click();
      await page.getByText('K7QH2M9XRT4WZP6VDN3BC8FA').waitFor();
      await page.getByRole('button', { name: 'Suspend', exact: true }).click();
      await expect(page.getByRole('textbox', { name: /reason/i })).toHaveCount(1);
    },
  },
  {
    name: 'registration',
    path: `/registrations/${registrationId}`,
    ready: (page) => page.getByRole('heading', { name: 'billing-portal' }),
  },
  {
    name: 'projections',
    path: '/projections',
    ready: (page) => page.getByRole('table', { name: 'Tenants not converged, oldest mark first' }),
    open: async (page) => {
      await page.getByRole('button', { name: 'Read the report' }).click();
      await page.getByRole('region', { name: 'The report an operator posts' }).waitFor();
    },
  },
  { name: 'principals', path: '/principals', ready: (page) => page.getByRole('heading', { level: 1 }) },
  { name: 'overview', path: '/', ready: (page) => page.getByRole('heading', { level: 1 }) },
  { name: 'developer', path: '/developer/', ready: (page) => page.getByRole('heading', { level: 1 }) },
];

interface Finding {
  readonly what: string;
  readonly where: string;
  readonly detail: string;
}

// measure lays the page out at the viewport's width and returns what is wrong with it.
async function measure(page: Page): Promise<Finding[]> {
  return page.evaluate((floor) => {
    const findings: { what: string; where: string; detail: string }[] = [];
    const describe = (element: Element): string => {
      const heading = element.querySelector('h2, h3');
      const label = heading?.textContent.trim() ?? element.textContent.trim().slice(0, 40);
      return `${element.tagName.toLowerCase()} "${label}"`;
    };
    const contentWidth = (element: Element): number => {
      const style = getComputedStyle(element);
      return (
        element.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth)
      );
    };
    // Every panel is at least 16rem wide, or as wide as the box it is in when that is narrower.
    for (const panel of document.querySelectorAll('section[data-elevation]')) {
      const parent = panel.parentElement;
      if (parent === null) {
        continue;
      }
      const width = panel.getBoundingClientRect().width;
      const room = contentWidth(parent);
      if (width + 1 < Math.min(floor, room)) {
        findings.push({
          what: 'panel narrower than 16rem or its container',
          where: describe(panel),
          detail: `${width.toFixed(1)}px wide in ${room.toFixed(1)}px`,
        });
      }
    }
    // No text is laid out one character per line: a text node of four characters or more on three
    // lines or more, every line narrower than one and a half of its font size.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? '';
      const element = node.parentElement;
      if (text.length < 4 || element === null || element.closest('.scnx-iam-visually-hidden') !== null) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      const em = parseFloat(getComputedStyle(element).fontSize);
      if (lines.length >= 3 && lines.every((rect) => rect.width <= 1.5 * em)) {
        findings.push({
          what: 'text laid out one character per line',
          where: describe(element.closest('section') ?? element),
          detail: `"${text.slice(0, 40)}" on ${String(lines.length)} lines`,
        });
      }
    }
    // The page does not scroll sideways; a wide table scrolls in its own region (WCAG 2.2 SC 1.4.10).
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 1) {
      findings.push({ what: 'page scrolls sideways', where: 'document', detail: `${String(overflow)}px` });
    }
    return findings;
  }, panelFloor);
}

async function useTheme(page: Page, theme: (typeof themes)[number]): Promise<void> {
  const stored = JSON.stringify({ state: { theme, locale: 'en' }, version: 0 });
  await page.addInitScript({
    content: `window.localStorage.setItem('scnx-iam-preferences', ${JSON.stringify(stored)});`,
  });
}

test.beforeEach(async ({ page }) => {
  await signIn(page, '/');
});

for (const theme of themes) {
  for (const main of pages) {
    test(`${main.path} keeps every panel and its text readable at every width, ${theme} theme`, async ({
      page,
    }, testInfo) => {
      await useTheme(page, theme);
      await page.setViewportSize({ width: widths[0], height: 900 });
      await page.goto(main.path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(main.ready(page)).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      if (main.open !== undefined) {
        await main.open(page);
      }
      const found: Record<number, Finding[]> = {};
      for (const width of widths) {
        await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        await page.screenshot({
          path: testInfo.outputPath(`layout-${main.name}-${theme}-${String(width)}.png`),
          fullPage: true,
        });
        const findings = await measure(page);
        if (findings.length > 0) {
          found[width] = findings;
        }
      }
      expect(found).toEqual({});
    });
  }
}
