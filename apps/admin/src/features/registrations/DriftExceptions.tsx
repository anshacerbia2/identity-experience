import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import { exceptionInForce } from '@identity-experience/app-core/domain/registration';
import { Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import { ExceptionForm } from './ExceptionForm';
import { fieldLabel } from './labels';
import { useExceptions } from './registrations-api';
import styles from './RegistrationsPage.module.scss';

// DriftExceptions is who may change what in the Admin Console for this client, and until when,
// with the form that grants another. Expired exceptions stay listed: each is the record of why a
// sanctioned change was left in place. The form is offered for an active registration only, the
// only kind the API grants one for.
export function DriftExceptions({
  registrationId,
  grantable,
}: {
  readonly registrationId: string;
  readonly grantable: boolean;
}): ReactElement {
  const exceptions = useExceptions(registrationId);
  if (exceptions.isPending) {
    return <Panel.Root aria-busy="true" />;
  }
  if (exceptions.isError) {
    return (
      <ApiErrorPanel
        error={exceptions.error}
        onRetry={() => {
          void exceptions.refetch();
        }}
      />
    );
  }
  // In force as of when the list was read, so every row is judged against the same moment.
  const readAt = exceptions.dataUpdatedAt;
  return (
    <section className={styles['section']} aria-labelledby="exceptions-title">
      <h2 id="exceptions-title" className={styles['sectionTitle']}>
        <Message id="exceptions.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="exceptions.description" />
      </p>
      {exceptions.data.length === 0 ? (
        <p className={styles['quiet']} role="status">
          <Message id="exceptions.empty" />
        </p>
      ) : (
        <Table.Root caption={<Message id="exceptions.caption" />} captionHidden>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>
                <Message id="exceptions.column.granted" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="exceptions.column.field" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="exceptions.column.actor" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="exceptions.column.reason" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="exceptions.column.grantedBy" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="exceptions.column.until" />
              </Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {exceptions.data.map((exception) => (
              <Table.Row key={exception.exception_id}>
                <Table.Cell>
                  <FormattedDate value={exception.granted_at} dateStyle="medium" timeStyle="short" />
                </Table.Cell>
                <Table.Cell>
                  <Message id={fieldLabel(exception.field_class)} />
                </Table.Cell>
                <Table.Cell mono>{exception.actor}</Table.Cell>
                <Table.Cell>
                  <span className={styles['reason']}>{exception.reason}</span>
                </Table.Cell>
                <Table.Cell mono>{exception.granted_by}</Table.Cell>
                <Table.Cell>
                  <span className={styles['stack']}>
                    <FormattedDate value={exception.expires_at} dateStyle="medium" timeStyle="short" />
                    {exceptionInForce(exception, readAt) ? (
                      <StatusPill tone="info">
                        <Message id="exceptions.inForce" />
                      </StatusPill>
                    ) : (
                      <StatusPill tone="neutral">
                        <Message id="exceptions.expired" />
                      </StatusPill>
                    )}
                  </span>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
      {grantable ? <ExceptionForm registrationId={registrationId} /> : null}
    </section>
  );
}
