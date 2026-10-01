import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

import { AppFrame, navClasses } from '@identity-experience/app-core/shell';
import { Icon } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

// AppShell is the Admin Portal in the shared frame: its name, its environment, and its
// navigation.
export function AppShell({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <AppFrame
      name={<Message id="app.name" />}
      environment={<Message id="app.environment.development" />}
      nav={
        <nav className={navClasses.nav} aria-labelledby="primary-nav-label">
          <p id="primary-nav-label" className={navClasses.section}>
            <Message id="shell.nav.section.control" />
          </p>
          <ul className={navClasses.list}>
            <li>
              <Link
                to="/"
                className={navClasses.item}
                activeProps={{ 'aria-current': 'page' }}
                activeOptions={{ exact: true }}
              >
                <Icon name="grid" />
                <Message id="shell.nav.overview" />
              </Link>
            </li>
            <li>
              <Link to="/registrations" className={navClasses.item} activeProps={{ 'aria-current': 'page' }}>
                <Icon name="pulse" />
                <Message id="shell.nav.registrations" />
              </Link>
            </li>
            <li>
              <Link to="/changes" className={navClasses.item} activeProps={{ 'aria-current': 'page' }}>
                <Icon name="check" />
                <Message id="shell.nav.changes" />
              </Link>
            </li>
            <li>
              <Link to="/principals" className={navClasses.item} activeProps={{ 'aria-current': 'page' }}>
                <Icon name="users" />
                <Message id="shell.nav.principals" />
              </Link>
            </li>
            <li>
              <Link to="/workloads" className={navClasses.item} activeProps={{ 'aria-current': 'page' }}>
                <Icon name="grid" />
                <Message id="shell.nav.workloads" />
              </Link>
            </li>
          </ul>
        </nav>
      }
    >
      {children}
    </AppFrame>
  );
}
