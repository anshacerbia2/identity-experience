import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

import { AppFrame, navClasses } from '@identity-experience/app-core/shell';
import { Icon } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

// AppShell is the account security experience in the shared frame: a person's own account, and
// nothing about anyone else's (TDD-identity-experience-002 §Delivery).
export function AppShell({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <AppFrame
      name={<Message id="app.name" />}
      environment={<Message id="app.environment.development" />}
      nav={
        <nav className={navClasses.nav} aria-labelledby="primary-nav-label">
          <div className={navClasses.group}>
            <p id="primary-nav-label" className={navClasses.section}>
              <Message id="shell.nav.section.account" />
            </p>
            <ul className={navClasses.list}>
              <li>
                <Link
                  to="/"
                  className={navClasses.item}
                  activeProps={{ 'aria-current': 'page' }}
                  activeOptions={{ exact: true }}
                >
                  <Icon name="shield" />
                  <Message id="shell.nav.security" />
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      }
    >
      {children}
    </AppFrame>
  );
}
