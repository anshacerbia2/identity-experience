import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

import { Icon, StatusPill } from '@identity-experience/ui';

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
  section: styles['navSection'],
  list: styles['navList'],
  item: styles['navItem'],
} as const;

// AppFrame is the frame every page of every application renders in: a navigation rail, a top bar
// stating the environment and the session, and the page. The environment and the session are
// always visible, because STD-GLB-FE-009 requires the current administrative scope to be. The
// application names itself and supplies its navigation; the rest is the same in each, so a person
// moving between them finds the session, the language and the theme where they left them.
export function AppFrame({
  name,
  environment,
  nav,
  children,
}: {
  readonly name: ReactNode;
  readonly environment: ReactNode;
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
          <span className={styles['brandMark']} aria-hidden="true">
            <Icon name="shield" />
          </span>
          <span className={styles['brandName']}>{name}</span>
        </Link>
        {nav}
      </aside>

      <div className={styles['column']}>
        <header className={styles['bar']}>
          <StatusPill tone="warning">{environment}</StatusPill>
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
