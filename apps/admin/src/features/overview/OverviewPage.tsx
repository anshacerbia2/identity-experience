import type { ReactElement } from 'react';

import { PageHead, Sheet } from '@identity-experience/app-core/shell';
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

// The hops a request from this console takes (README, "The BFF is not optional"): what each holds, and
// what carries the request on to the next.
interface Hop {
  readonly name: MessageKey;
  readonly holds: MessageKey;
  readonly onward: MessageKey | null;
}

const hops: readonly Hop[] = [
  {
    name: 'overview.plane.browser',
    holds: 'overview.plane.browser.holds',
    onward: 'overview.plane.hop.cookie',
  },
  { name: 'overview.plane.bff', holds: 'overview.plane.bff.holds', onward: 'overview.plane.hop.token' },
  {
    name: 'overview.plane.control',
    holds: 'overview.plane.control.holds',
    onward: 'overview.plane.hop.admin',
  },
  { name: 'overview.plane.kernel', holds: 'overview.plane.kernel.holds', onward: null },
];

export function OverviewPage(): ReactElement {
  return (
    <div className={styles['root']}>
      <PageHead
        display
        eyebrow={<Message id="overview.eyebrow" />}
        title={<Message id="overview.title" />}
        lead={<Message id="overview.lead" />}
      >
        <StatusPill tone="success">
          <Message id="overview.status.foundation" />
        </StatusPill>
      </PageHead>

      <Sheet
        id="plane"
        title={<Message id="overview.plane.title" />}
        description={<Message id="overview.plane.description" />}
      >
        <ol className={styles['plane']}>
          {hops.map((hop) => (
            <li key={hop.name} className={styles['hop']}>
              <span className={styles['hopName']}>
                <Message id={hop.name} />
              </span>
              <span className={styles['hopHolds']}>
                <Message id={hop.holds} />
              </span>
              {hop.onward === null ? null : (
                <span className={styles['onward']}>
                  <Message id={hop.onward} />
                </span>
              )}
            </li>
          ))}
        </ol>
      </Sheet>

      <Sheet id="surfaces" title={<Message id="overview.surfaces.title" />} flush>
        <ul className={styles['cells']}>
          {surfaces.map((surface) => (
            <li key={surface.title} className={styles['cell']}>
              <h3 className={styles['cellTitle']}>
                <Message id={surface.title} />
              </h3>
              <p className={styles['cellBody']}>
                <Message id={surface.body} />
              </p>
              <StatusPill tone={surface.tone}>
                <Message id={surface.status} />
              </StatusPill>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
