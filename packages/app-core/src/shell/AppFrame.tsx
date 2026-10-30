import { Link } from '@tanstack/react-router';
import { useEffect, useRef, type ReactElement, type ReactNode, type RefObject } from 'react';

import { PLATFORM_THEME, StatusPill } from '@identity-experience/ui';

import styles from './AppFrame.module.scss';
import { CoreMessage } from '../i18n/CoreMessage';
import { LocaleSwitch } from '../preferences/LocaleSwitch';
import { ThemeToggle } from '../preferences/ThemeToggle';
import { SessionControl } from '../session/SessionControl';
import { SignInNotice } from '../session/SignInNotice';

// The classes an application's navigation uses inside the frame's rail: a section label, a list,
// and an item whose aria-current marks the page.
export const navClasses = {
  nav: styles['nav'],
  group: styles['navGroup'],
  section: styles['navSection'],
  list: styles['navList'],
  item: styles['navItem'],
} as const;

// The Scnehaux mark: two slanted bars, the upper one set right, in its own 21 × 9 box (scnehaux-design
// brand/Brand.html), in the ink role, so it is light on the dark mode and dark on the light one.
function BrandMark(): ReactElement {
  return (
    <svg className={styles['brandMark']} viewBox="2 8 21 9" aria-hidden="true" focusable="false">
      <path d="M23 8L20 12L9 12L12 8ZM16 13L13 17L2 17L5 13Z" />
    </svg>
  );
}

// useHere marks the sheet being read (Sheet), as the documentation site does: the last whose rule has
// reached the foot of what stays in view (the scope line, and the bar while it holds), or, at the end of
// the page, the last sheet. On a large screen that is the sheet whose bar is held. Its number turns
// blue. Every position is read first and every mark written after, once a frame at most, so a scroll
// never makes the browser lay the page out twice. The page's content changes as its reads answer, so a
// change to it marks again.
function useHere(main: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = main.current;
    if (root === null) {
      return undefined;
    }
    let frame = 0;
    const mark = (): void => {
      frame = 0;
      const sheets = [...root.querySelectorAll<HTMLElement>('[data-sheet]')];
      const scope = document.querySelector('[data-scope-line]');
      const held = [scope, scope?.nextElementSibling].map(
        (part) => part?.getBoundingClientRect().bottom ?? 0,
      );
      const line = Math.max(...held) + 1;
      const atEnd =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const tops = sheets.map((sheet) => sheet.getBoundingClientRect().top);
      let here = atEnd ? sheets.length - 1 : -1;
      if (!atEnd) {
        tops.forEach((top, index) => {
          if (top <= line) {
            here = index;
          }
        });
      }
      sheets.forEach((sheet, index) => {
        sheet.toggleAttribute('data-here', index === here);
      });
    };
    const schedule = (): void => {
      if (frame === 0) {
        frame = requestAnimationFrame(mark);
      }
    };
    mark();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const changes = new MutationObserver(schedule);
    changes.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      changes.disconnect();
    };
  }, [main]);
}

// AppFrame is the frame every page of every application renders in, drawn as the documentation site
// draws its pages (scnehaux-design scnx-platform/Brand-Book.html): the scope line, a bar of cells with
// the mark, the environment and the session, then a column bounded by two lines, holding the
// navigation rail and the page, and the page's title block at its foot. The application names itself,
// its scope and its navigation; the rest is the same in each, so a person moving between them finds the
// session, the language and the theme where they left them.
//
// The scope line is the one thing that stays in view at every width (SAD-002 2.2.0 §8.7: "the scope
// line stays in view at every width, compacted to one sticky line on a small viewport, and nothing
// else is required to stay in view"). It is one short line, never wrapped. Under the wide layout, or
// on a short viewport, the bar, the rail and a sheet's bar are static and scroll away
// (STD-GLB-FE-005 2.2.0 §3.10; TDD-identity-experience-003 1.32.0 §Layout).
export function AppFrame({
  name,
  environment,
  scope,
  nav,
  children,
}: {
  readonly name: ReactNode;
  readonly environment: ReactNode;
  readonly scope: ReactNode;
  readonly nav: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const main = useRef<HTMLElement>(null);
  useHere(main);
  return (
    <div className={styles['root']}>
      <a className={styles['skip']} href="#main">
        <CoreMessage id="app.skipToContent" />
      </a>

      <p className={styles['scope']} data-scope-line="">
        {/* Blue means here: the scope is where the person is. */}
        <span className={styles['here']} aria-hidden="true" />
        <span className={styles['scopeText']}>{scope}</span>
      </p>

      <header className={styles['bar']}>
        <Link to="/" className={styles['brand']}>
          <BrandMark />
          <span className={styles['brandName']}>{name}</span>
        </Link>
        <div className={styles['environment']}>
          <StatusPill tone="warning">{environment}</StatusPill>
        </div>
        <div className={styles['barEnd']}>
          <SessionControl />
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </header>

      <div className={styles['column']}>
        <aside className={styles['rail']}>{nav}</aside>

        <div className={styles['page']}>
          <SignInNotice />
          <main id="main" ref={main} className={styles['main']} tabIndex={-1}>
            {children}
          </main>

          {/* The page's title block, as a drawing's: what this console is and what holds it to account. */}
          <footer className={styles['titleBlock']}>
            <dl className={styles['titleCells']}>
              <div>
                <dt>
                  <CoreMessage id="shell.titleBlock.application" />
                </dt>
                <dd>{name}</dd>
              </div>
              <div>
                <dt>
                  <CoreMessage id="shell.titleBlock.authority" />
                </dt>
                <dd>
                  <CoreMessage id="shell.titleBlock.authority.value" />
                </dd>
              </div>
              <div>
                <dt>
                  <CoreMessage id="shell.titleBlock.session" />
                </dt>
                <dd>
                  <CoreMessage id="shell.titleBlock.session.value" />
                </dd>
              </div>
              <div>
                <dt>
                  <CoreMessage id="shell.titleBlock.drawing" />
                </dt>
                <dd>{PLATFORM_THEME}</dd>
              </div>
            </dl>
          </footer>
        </div>
      </div>
    </div>
  );
}
