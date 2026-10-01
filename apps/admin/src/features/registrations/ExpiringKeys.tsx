import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import {
  daysLeft,
  keyExpiryAttention,
  type ExpiringKey,
  type KeyExpirySeverity,
} from '@/domain/registration';

import { attentionTone } from './labels';
import { useExpiringKeys } from './registrations-api';
import styles from './RegistrationsPage.module.scss';

const severityLabel: Readonly<Record<KeyExpirySeverity, MessageKey>> = {
  no_key: 'expiring.severity.no_key',
  critical: 'expiring.severity.critical',
  warning: 'expiring.severity.warning',
};

// The days left are counted from when the warning was read, so every row uses the same clock and a
// re-render does not change them.
function Ends({ entry, readAt }: { readonly entry: ExpiringKey; readonly readAt: number }): ReactElement {
  if (entry.expires_at === null) {
    return (
      <span className={styles['quiet']}>
        <Message id="expiring.noKey" />
      </span>
    );
  }
  return (
    <span className={styles['meta']}>
      <FormattedDate value={entry.expires_at} dateStyle="medium" timeStyle="short" />
      <span>
        <Message id="expiring.daysLeft" values={{ days: daysLeft(entry.expires_at, readAt) }} />
      </span>
    </span>
  );
}

// ExpiringKeys lists the clients the key expiry warning reports (TDD-identity-control-003 §Key Expiry
// Warnings): a key ending with no successor registered, or no key the kernel accepts. It reads only:
// the remedy is the client's own rotation. It is absent while none is reported; DriftSummary reports a
// failed read of the registration surface.
export function ExpiringKeys(): ReactElement | null {
  const expiring = useExpiringKeys();
  const entries = expiring.data?.registrations ?? [];
  if (entries.length === 0) {
    return null;
  }
  return (
    <Panel.Root aria-labelledby="expiring-title">
      <Panel.Header>
        <Panel.Title id="expiring-title">
          <Message id="expiring.title" />
        </Panel.Title>
        <Panel.Description>
          <Message
            id="expiring.description"
            values={{
              warning: expiring.data?.warning_days ?? 14,
              critical: expiring.data?.critical_days ?? 3,
            }}
          />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body className={styles['section']}>
        <Table.Root caption={<Message id="expiring.caption" />} captionHidden>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>
                <Message id="registrations.column.client" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="expiring.column.severity" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="expiring.column.kid" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="expiring.column.ends" />
              </Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {entries.map((entry) => (
              <Table.Row key={entry.registration_id}>
                <Table.Cell mono>
                  <Link
                    to="/registrations/$registrationId"
                    params={{ registrationId: entry.registration_id }}
                    className={styles['clientLink']}
                  >
                    {entry.client_key}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <StatusPill tone={attentionTone[keyExpiryAttention[entry.severity]]}>
                    <Message id={severityLabel[entry.severity]} />
                  </StatusPill>
                </Table.Cell>
                <Table.Cell mono>{entry.kid ?? '—'}</Table.Cell>
                <Table.Cell>
                  <Ends entry={entry} readAt={expiring.dataUpdatedAt} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
        <p className={styles['quiet']}>
          <Message id="expiring.remedy" />
        </p>
      </Panel.Body>
    </Panel.Root>
  );
}
