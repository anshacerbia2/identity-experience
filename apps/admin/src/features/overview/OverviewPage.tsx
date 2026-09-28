import type { ReactElement } from 'react';

import { Icon, type IconName, Panel, StatusPill, type StatusTone } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';

import styles from './OverviewPage.module.scss';

// The landing page. Until sign-in exists it states what this console will hold and in what order,
// and it shows no figure: a number on this page would be a number nobody measured.

interface Surface {
  readonly icon: IconName;
  readonly title: MessageKey;
  readonly body: MessageKey;
  readonly tone: StatusTone;
  readonly status: MessageKey;
}

const surfaces: readonly Surface[] = [
  {
    icon: 'key',
    title: 'overview.card.signin.title',
    body: 'overview.card.signin.body',
    tone: 'info',
    status: 'overview.status.next',
  },
  {
    icon: 'pulse',
    title: 'overview.card.registrations.title',
    body: 'overview.card.registrations.body',
    tone: 'neutral',
    status: 'overview.status.planned',
  },
  {
    icon: 'users',
    title: 'overview.card.principals.title',
    body: 'overview.card.principals.body',
    tone: 'neutral',
    status: 'overview.status.planned',
  },
];

export function OverviewPage(): ReactElement {
  return (
    <div className={styles['root']}>
      <section className={styles['hero']} aria-labelledby="overview-title">
        <p className={styles['eyebrow']}>
          <span className={styles['beacon']} aria-hidden="true" />
          <Message id="overview.eyebrow" />
        </p>
        <h1 id="overview-title" className={styles['title']}>
          <Message id="overview.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="overview.lead" />
        </p>
        <StatusPill tone="success">
          <Message id="overview.status.foundation" />
        </StatusPill>
      </section>

      <ul className={styles['grid']}>
        {surfaces.map((surface) => (
          <li key={surface.title}>
            <Panel.Root className={styles['card']}>
              <Panel.Header>
                <span className={styles['cardIcon']} aria-hidden="true">
                  <Icon name={surface.icon} />
                </span>
                <Panel.Title>
                  <Message id={surface.title} />
                </Panel.Title>
                <Panel.Description>
                  <Message id={surface.body} />
                </Panel.Description>
              </Panel.Header>
              <Panel.Body>
                <StatusPill tone={surface.tone}>
                  <Message id={surface.status} />
                </StatusPill>
              </Panel.Body>
            </Panel.Root>
          </li>
        ))}
      </ul>
    </div>
  );
}
