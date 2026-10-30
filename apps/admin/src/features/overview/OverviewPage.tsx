import type { ReactElement } from 'react';

import { StatusPill, type StatusTone } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';

import styles from './OverviewPage.module.scss';

// The landing page. Until the console's screens exist it states what it will hold and in what
// order, and it shows no figure: a number on this page would be a number nobody measured.

interface Surface {
  readonly title: MessageKey;
  readonly body: MessageKey;
  readonly tone: StatusTone;
  readonly status: MessageKey;
}

const surfaces: readonly Surface[] = [
  {
    title: 'overview.card.signin.title',
    body: 'overview.card.signin.body',
    tone: 'success',
    status: 'overview.status.ready',
  },
  {
    title: 'overview.card.registrations.title',
    body: 'overview.card.registrations.body',
    tone: 'success',
    status: 'overview.status.ready',
  },
  {
    title: 'overview.card.principals.title',
    body: 'overview.card.principals.body',
    tone: 'info',
    status: 'overview.status.inProgress',
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

      <ul className={styles['cells']}>
        {surfaces.map((surface) => (
          <li key={surface.title} className={styles['cell']}>
            <h2 className={styles['cellTitle']}>
              <Message id={surface.title} />
            </h2>
            <p className={styles['cellBody']}>
              <Message id={surface.body} />
            </p>
            <StatusPill tone={surface.tone}>
              <Message id={surface.status} />
            </StatusPill>
          </li>
        ))}
      </ul>
    </div>
  );
}
