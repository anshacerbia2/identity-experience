import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import {
  unmanagedEnabled,
  unmanagedFindings,
  type Finding,
} from '@identity-experience/app-core/domain/registration';
import { Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import { useDriftStatus } from './registrations-api';
import styles from './RegistrationsPage.module.scss';

function Enabled({ finding }: { readonly finding: Finding }): ReactElement {
  const enabled = unmanagedEnabled(finding);
  if (enabled === null) {
    return <Message id="unmanaged.enabled.unknown" />;
  }
  return (
    <StatusPill tone={enabled ? 'danger' : 'neutral'}>
      <Message id={enabled ? 'unmanaged.enabled.yes' : 'unmanaged.enabled.no'} />
    </StatusPill>
  );
}

// UnmanagedClients lists the Keycloak clients no registration describes, so an operator knows which
// client and whom to ask. It offers neither way out: adoption runs through the Identity Control API
// with a dry run first, and deletion through the Admin Console (TDD-identity-experience-003
// §Registration Drift Oversight). It is absent while none is open; DriftSummary reports a failed read.
export function UnmanagedClients(): ReactElement | null {
  const drift = useDriftStatus();
  const unmanaged = unmanagedFindings(drift.data?.findings ?? null);
  if (unmanaged.length === 0) {
    return null;
  }
  return (
    <Panel.Root aria-labelledby="unmanaged-title">
      <Panel.Header>
        <Panel.Title id="unmanaged-title">
          <Message id="unmanaged.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="unmanaged.description" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body className={styles['section']}>
        <Table.Root caption={<Message id="unmanaged.caption" />} captionHidden>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>
                <Message id="registrations.column.client" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="unmanaged.column.enabled" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="findings.column.actor" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="unmanaged.column.changed" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="findings.column.detected" />
              </Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {unmanaged.map((finding) => (
              <Table.Row key={finding.finding_id}>
                <Table.Cell mono>{finding.client_key}</Table.Cell>
                <Table.Cell>
                  <Enabled finding={finding} />
                </Table.Cell>
                <Table.Cell mono>{finding.actor ?? <Message id="findings.unknownActor" />}</Table.Cell>
                <Table.Cell>
                  {finding.changed_at === null ? (
                    <span className={styles['quiet']}>
                      <Message id="unmanaged.changed.unknown" />
                    </span>
                  ) : (
                    <FormattedDate value={finding.changed_at} dateStyle="medium" timeStyle="medium" />
                  )}
                </Table.Cell>
                <Table.Cell>
                  <FormattedDate value={finding.detected_at} dateStyle="medium" timeStyle="medium" />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
        <ul className={styles['quiet']}>
          <li>
            <Message id="unmanaged.adopt" values={{ route: 'POST /v1/registrations:adopt' }} />
          </li>
          <li>
            <Message id="unmanaged.delete" />
          </li>
        </ul>
      </Panel.Body>
    </Panel.Root>
  );
}
