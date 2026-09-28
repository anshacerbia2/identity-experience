import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

import { Icon, StatusPill } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import styles from './AppShell.module.scss';
import { LocaleSwitch } from './LocaleSwitch';
import { ThemeToggle } from './ThemeToggle';

// AppShell is the frame every page renders in: a navigation rail, a top bar stating the
// environment and the session, and the page. The environment and the session are always visible,
// because STD-GLB-FE-009 requires the current administrative scope to be.

export function AppShell({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div className={styles['root']}>
      <a className={styles['skip']} href="#main">
        <Message id="app.skipToContent" />
      </a>

      <aside className={styles['rail']}>
        <Link to="/" className={styles['brand']}>
          <span className={styles['brandMark']} aria-hidden="true">
            <Icon name="shield" />
          </span>
          <span className={styles['brandName']}>
            <Message id="app.name" />
          </span>
        </Link>

        <nav className={styles['nav']} aria-labelledby="primary-nav-label">
          <p id="primary-nav-label" className={styles['navSection']}>
            <Message id="shell.nav.section.control" />
          </p>
          <ul className={styles['navList']}>
            <li>
              <Link
                to="/"
                className={styles['navItem']}
                activeProps={{ 'aria-current': 'page' }}
                activeOptions={{ exact: true }}
              >
                <Icon name="grid" />
                <Message id="shell.nav.overview" />
              </Link>
            </li>
          </ul>
        </nav>
      </aside>

      <div className={styles['column']}>
        <header className={styles['bar']}>
          <StatusPill tone="warning">
            <Message id="app.environment.development" />
          </StatusPill>
          <div className={styles['barEnd']}>
            <StatusPill tone="neutral">
              <Message id="shell.session.signedOut" />
            </StatusPill>
            <LocaleSwitch />
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className={styles['main']} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
