import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

import { AppFrame, navClasses } from '@identity-experience/app-core/shell';
import { Icon, type IconName } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';

// A page in the navigation: where it goes, its icon, and its label.
interface NavItem {
  readonly to:
    '/' | '/principals' | '/workloads' | '/registrations' | '/changes' | '/emergency-grants' | '/projections';
  readonly icon: IconName;
  readonly label: MessageKey;
}

// The navigation is grouped by what an administrator acts on, never by which system answers
// (TDD-identity-experience-003 §Navigation). A group appears once it holds a built page.
const groups: readonly {
  readonly id: string;
  readonly label: MessageKey | null;
  readonly items: readonly NavItem[];
}[] = [
  { id: 'home', label: null, items: [{ to: '/', icon: 'grid', label: 'shell.nav.overview' }] },
  {
    id: 'identities',
    label: 'shell.nav.section.identities',
    items: [
      { to: '/principals', icon: 'users', label: 'shell.nav.principals' },
      { to: '/workloads', icon: 'grid', label: 'shell.nav.workloads' },
    ],
  },
  {
    id: 'applications',
    label: 'shell.nav.section.applications',
    items: [{ to: '/registrations', icon: 'pulse', label: 'shell.nav.registrations' }],
  },
  {
    id: 'governance',
    label: 'shell.nav.section.governance',
    items: [
      { to: '/changes', icon: 'check', label: 'shell.nav.changes' },
      { to: '/emergency-grants', icon: 'shield', label: 'shell.nav.emergency' },
    ],
  },
  {
    id: 'monitoring',
    label: 'shell.nav.section.monitoring',
    items: [{ to: '/projections', icon: 'globe', label: 'shell.nav.projections' }],
  },
];

// AppShell is the Admin Portal in the shared frame: its name, its environment, and its
// navigation.
export function AppShell({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <AppFrame
      name={<Message id="app.name" />}
      environment={<Message id="app.environment.development" />}
      nav={
        <nav className={navClasses.nav} aria-labelledby="primary-nav-label">
          <span id="primary-nav-label" hidden>
            <Message id="shell.nav.label" />
          </span>
          {groups.map((group) => (
            <div key={group.id} className={navClasses.group}>
              {group.label === null ? null : (
                <p id={`nav-group-${group.id}`} className={navClasses.section}>
                  <Message id={group.label} />
                </p>
              )}
              <ul
                className={navClasses.list}
                aria-labelledby={group.label === null ? undefined : `nav-group-${group.id}`}
              >
                {group.items.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={navClasses.item}
                      activeProps={{ 'aria-current': 'page' }}
                      activeOptions={{ exact: item.to === '/' }}
                    >
                      <Icon name={item.icon} />
                      <Message id={item.label} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      }
    >
      {children}
    </AppFrame>
  );
}
