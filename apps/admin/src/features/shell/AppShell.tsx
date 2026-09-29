import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

import { Icon, StatusPill } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';

import styles from './AppShell.module.scss';
import { LocaleSwitch } from './LocaleSwitch';
import { SessionControl } from './SessionControl';
import { ThemeToggle } from './ThemeToggle';

// AppShell is the frame every page renders in: a navigation rail, a top bar stating the
// environment and the session, and the page. The environment and the session are always visible,
// because STD-GLB-FE-009 requires the current administrative scope to be.

const signInNotices: ReadonlyMap<string, MessageKey> = new Map<string, MessageKey>([
  ['failed', 'shell.session.signInFailed'],
  ['unavailable', 'shell.session.signInUnavailable'],
]);

export function AppShell({ children }: { readonly children: ReactNode }): ReactElement {
  // The BFF lands a failed sign-in on /?sign-in=failed when it was refused, and on
  // /?sign-in=unavailable when Keycloak did not answer; why stays in its log. Only the second is
  // worth simply trying again, so the two read differently.
  const signIn = useRouterState({
    select: (state) => new URLSearchParams(state.location.searchStr).get('sign-in'),
  });
  const signInNotice = signInNotices.get(signIn ?? '');
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
            <li>
              <Link
                to="/registrations"
                className={styles['navItem']}
                activeProps={{ 'aria-current': 'page' }}
              >
                <Icon name="pulse" />
                <Message id="shell.nav.registrations" />
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
            <SessionControl />
            <LocaleSwitch />
            <ThemeToggle />
          </div>
        </header>

        {signInNotice === undefined ? null : (
          <p className={styles['notice']} role="alert">
            <Icon name="alert" />
            <Message id={signInNotice} />
          </p>
        )}

        <main id="main" className={styles['main']} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
