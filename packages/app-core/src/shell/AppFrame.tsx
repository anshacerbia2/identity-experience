import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

import { StatusPill } from '@identity-experience/ui';

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

// AppFrame is the frame every page of every application renders in: a navigation rail, the scope
// line, a top bar stating the environment and the session, and the page. The application names
// itself, its scope and its navigation; the rest is the same in each, so a person moving between them
// finds the session, the language and the theme where they left them.
//
// The scope line is the one thing that stays in view at every width (SAD-002 2.2.0 §8.7: "the scope
// line stays in view at every width, compacted to one sticky line on a small viewport, and nothing
// else is required to stay in view"). It is one short line, never wrapped. Under the wide layout, or
// on a short viewport, the bar with the environment and the session is static and scrolls away
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
  return (
    <div className={styles['root']}>
      <a className={styles['skip']} href="#main">
        <CoreMessage id="app.skipToContent" />
      </a>

      <aside className={styles['rail']}>
        <Link to="/" className={styles['brand']}>
          <BrandMark />
          <span className={styles['brandName']}>{name}</span>
        </Link>
        {nav}
      </aside>

      <div className={styles['column']}>
        <p className={styles['scope']} data-scope-line="">
          {/* Blue means here: the scope is where the person is. */}
          <span className={styles['here']} aria-hidden="true" />
          <span className={styles['scopeText']}>{scope}</span>
        </p>

        <header className={styles['bar']}>
          <div className={styles['barStart']}>
            <StatusPill tone="warning">{environment}</StatusPill>
          </div>
          <div className={styles['barEnd']}>
            <SessionControl />
            <LocaleSwitch />
            <ThemeToggle />
          </div>
        </header>

        <SignInNotice />

        <main id="main" className={styles['main']} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
