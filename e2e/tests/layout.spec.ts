// Layout in Chromium at the widths a person uses, in both themes, with long content
// (TDD-identity-experience-003 §Layout): no panel collapses to a sliver, no text is laid out one
// character per line, and the page does not scroll sideways. jsdom has no layout, so this is checked
// here. A full-page screenshot of each width is kept with the test's output, for review.
import { expect, test, type Page } from '@playwright/test';

import { enrolmentCode, invitationToken, registrationId, subjectPrincipal } from '../shared.js';
import { planAdoption, signIn } from './support.js';

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

// The enrolment page (TDD-identity-experience-001 1.24.0), opened from its link, the token in the
// fragment: a code asked for and a wrong one returned, so the one refusal shows beside the form; or
// the right one, so the temporary password shows once.
async function enrolmentRefused(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await page.getByRole('textbox', { name: 'Code' }).fill('00000000');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.getByRole('alert').filter({ hasText: 'The code is wrong' }).waitFor();
}

async function enrolmentCreated(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await page.getByRole('textbox', { name: 'Code' }).fill(enrolmentCode);
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.getByText('K7QH2M9XRT4WZP6VDN3BC8FA').waitFor();
}

// The enrolment callers on the Workloads page, listed and with the registration form open
// (TDD-identity-experience-003 1.35.0 §Enrolment Callers).
async function enrolmentCallers(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Show the enrolment callers' }).click();
  await page.getByRole('table', { name: 'Workloads admitted to the enrolment routes' }).waitFor();
  await page.getByRole('button', { name: 'Register a caller' }).click();
  await page.getByRole('heading', { name: 'Register an enrolment caller' }).waitFor();
}

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
  {
    name: 'workloads',
    path: '/workloads',
    ready: (page) => page.getByRole('heading', { level: 1 }),
    open: enrolmentCallers,
  },
  {
    name: 'enrolment-refused',
    path: `/account/enrol#${invitationToken}`,
    ready: (page) => page.getByRole('button', { name: 'Send me a code' }),
    open: enrolmentRefused,
  },
  {
    name: 'enrolment-created',
    path: `/account/enrol#${invitationToken}-created`,
    ready: (page) => page.getByRole('button', { name: 'Send me a code' }),
    open: enrolmentCreated,
  },
  {
    name: 'registrations',
    path: '/registrations',
    ready: (page) => page.getByRole('link', { name: 'billing-portal' }),
  },
  { name: 'changes', path: '/changes', ready: (page) => page.getByRole('heading', { level: 1 }) },
  {
    name: 'emergency-grants',
    path: '/emergency-grants',
    ready: (page) => page.getByRole('table', { name: /Emergency grants/ }),
  },
  {
    name: 'principals',
    path: '/principals',
    ready: (page) => page.getByRole('heading', { level: 1 }),
    open: planAdoption,
  },
  {
    name: 'ceremony',
    path: '/ceremony',
    ready: (page) => page.getByText('Oscar Operator'),
    open: async (page) => {
      await page.getByRole('button', { name: 'Record review' }).click();
      await page.getByRole('heading', { name: 'Record a review of the ceremony' }).waitFor();
    },
  },
  {
    name: 'consents',
    path: '/account/consents',
    ready: (page) => page.getByRole('table', { name: 'Applications you allowed' }),
  },
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
    // Each element that reaches past the viewport is named, innermost first, so the failure says what
    // to fix: an element counts when its right edge is past the viewport and no child of it is, and
    // no box between it and the page scrolls or clips it.
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 1) {
      const past = new Set<Element>();
      for (const element of document.body.querySelectorAll('*')) {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.right <= window.innerWidth + 1) {
          continue;
        }
        let clipped = false;
        for (let up = element.parentElement; up !== null && up !== document.body; up = up.parentElement) {
          if (
            getComputedStyle(up).overflowX !== 'visible' &&
            up.getBoundingClientRect().right <= window.innerWidth + 1
          ) {
            clipped = true;
            break;
          }
        }
        if (!clipped) {
          past.add(element);
        }
      }
      const name = (element: Element): string => {
        const classes = [...element.classList]
          .slice(0, 2)
          .map((value) => `.${value}`)
          .join('');
        const text = element.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
        return `${element.tagName.toLowerCase()}${classes}${text === '' ? '' : ` "${text}"`}`;
      };
      const innermost = [...past]
        .filter((element) => ![...element.children].some((child) => past.has(child)))
        .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
        .slice(0, 3);
      findings.push({ what: 'page scrolls sideways', where: 'document', detail: `${String(overflow)}px` });
      for (const element of innermost) {
        const box = element.getBoundingClientRect();
        findings.push({
          what: 'element reaches past the viewport',
          where: name(element),
          detail: `${box.width.toFixed(1)}px wide, right edge at ${box.right.toFixed(1)}px of ${String(window.innerWidth)}px`,
        });
      }
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

// Only the scope line stays in view on a small or a short viewport, one line high, and tabbing backwards
// through the page never leaves the focused element under it (STD-GLB-FE-005 2.3.0 §3.10, WCAG 2.2
// SC 2.4.11; TDD-identity-experience-003 1.33.0 §Layout). 256 CSS px tall is a 1024 px tall screen at
// 400% zoom. The same tab check runs once above both thresholds (60rem wide, 30rem tall), where the
// full banner may stay in view and wrap, so only the one-line assertion is left out there (2.3.0).
const short = [
  { width: 320, height: 256, oneLine: true },
  { width: 1280, height: 256, oneLine: true },
  { width: 1280, height: 800, oneLine: false },
] as const;

// One line of the scope line's text, with its padding: anything taller is a second row.
const oneLine = 40;

// stuck is every element that stays where it is while the page scrolls, and is in view: its bottom
// edge is the lowest point focus must stay below.
async function stuck(page: Page): Promise<{ readonly bottom: number; readonly what: readonly string[] }> {
  return page.evaluate(() => {
    const found = [...document.body.querySelectorAll('*')].filter((element) => {
      const position = getComputedStyle(element).position;
      const box = element.getBoundingClientRect();
      return (
        (position === 'sticky' || position === 'fixed') && box.height > 0 && box.bottom > 0 && box.top < 1
      );
    });
    return {
      bottom: Math.max(0, ...found.map((element) => element.getBoundingClientRect().bottom)),
      what: found.map((element) =>
        element.hasAttribute('data-scope-line')
          ? 'the scope line'
          : `${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 30)}"`,
      ),
    };
  });
}

for (const main of pages) {
  test(`${main.path} keeps only the scope line in view on a short viewport, and focus out from under it at every size`, async ({
    page,
  }, testInfo) => {
    await page.goto(main.path);
    await expect(main.ready(page)).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    if (main.open !== undefined) {
      await main.open(page);
    }
    for (const size of short) {
      await page.setViewportSize(size);
      await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      const line = await stuck(page);
      if (size.oneLine) {
        expect(line.what, `${String(size.width)}×${String(size.height)}`).toEqual(['the scope line']);
        expect(line.bottom, `${String(size.width)}×${String(size.height)}`).toBeLessThanOrEqual(oneLine);
      }
      // Scrolled to the end, so the screenshot shows what stays in view over the page.
      await page.screenshot({
        path: testInfo.outputPath(
          `layout-short-${main.name}-${String(size.width)}x${String(size.height)}.png`,
        ),
      });

      // From the end of the page backwards, each focused element at least partly below the line and in
      // the viewport (SC 2.4.11: "not entirely hidden").
      await page.locator('body').press('End');
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      const hidden: string[] = [];
      let stops = 0;
      for (; stops < 80; stops++) {
        await page.keyboard.press('Shift+Tab');
        const focused = await page.evaluate(() => {
          const element = document.activeElement;
          if (element === null || element === document.body) {
            return null;
          }
          const box = element.getBoundingClientRect();
          // Entirely under something painted over it: none of its centre and four inset corners is a
          // point where it, or a part of it, is the topmost element (SC 2.4.11 "entirely hidden"). Above
          // both thresholds the rail and the banner are sticky beside and above the page, so only what
          // actually paints over the element counts.
          const xs = [box.left + 1, box.left + box.width / 2, box.right - 1];
          const ys = [box.top + 1, box.top + box.height / 2, box.bottom - 1];
          const points = xs.flatMap((x) => ys.map((y) => [x, y] as const));
          const inView = points.filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
          const covered =
            inView.length > 0 &&
            inView.every(([x, y]) => {
              const top = document.elementFromPoint(x, y);
              return top === null || !(element.contains(top) || top.contains(element));
            });
          return {
            what: `${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 30)}"`,
            top: box.top,
            bottom: box.bottom,
            visible: box.width > 0 && box.height > 0,
            covered,
          };
        });
        if (focused === null) {
          break;
        }
        const under = size.oneLine ? focused.bottom <= line.bottom : focused.covered;
        if (focused.visible && (under || focused.top >= size.height)) {
          hidden.push(`${focused.what}: ${focused.top.toFixed(0)}–${focused.bottom.toFixed(0)}px`);
        }
      }
      expect(stops, 'tabbing reached focusable elements').toBeGreaterThan(0);
      expect(hidden, `${String(size.width)}×${String(size.height)}`).toEqual([]);
    }
  });
}

// A status longer than its room wraps inside its pill rather than pushing the page sideways
// (TDD-identity-experience-003 1.32.0 §Layout): the signed-in name, in the bar, made long here.
test('a long status wraps inside its pill at 320 CSS px', async ({ page }, testInfo) => {
  const longName = 'Ada Augusta King-Noel, Countess of Lovelace, Analytical Engine Programmer';
  await page.route('**/auth/session', async (route) => {
    const response = await route.fetch();
    const session = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...session, displayName: longName } });
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/account/');
  const pill = page.getByText(longName);
  await expect(pill).toBeVisible();
  const box = await pill.boundingBox();
  const lineHeight = await pill.evaluate((element) => parseFloat(getComputedStyle(element).fontSize) * 2);
  expect(box?.height ?? 0, 'the pill wraps to more than one line').toBeGreaterThan(lineHeight);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  const findings = await measure(page);
  await page.screenshot({ path: testInfo.outputPath('layout-long-pill-320.png'), fullPage: true });
  expect(findings).toEqual([]);
});
