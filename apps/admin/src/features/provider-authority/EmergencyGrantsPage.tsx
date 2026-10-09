import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import { overdueCount } from '@/domain/projections';

import { useEmergencyValidation } from './provider-authority-api';
import styles from './ProviderAuthority.module.scss';

function Grants(): ReactElement {
  const validation = useEmergencyValidation();
  if (validation.isPending) {
    return <Panel.Root aria-busy="true" />;
  }
  if (validation.isError) {
    return <ApiErrorPanel error={validation.error} onRetry={() => void validation.refetch()} />;
  }
  const grants = validation.data.grants ?? [];
  const overdue = overdueCount(validation.data);
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="emergency.grants.title" />
        </Panel.Title>
        <Panel.Description>
          <Message
            id="emergency.period"
            values={{ scope: validation.data.scope, days: validation.data.validation_period_days }}
          />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        {grants.length === 0 ? (
          <p className={styles['quiet']} role="status">
            <Message id="emergency.empty" />
          </p>
        ) : (
          <>
            <p className={styles['quiet']} role="status">
              <Message id="emergency.overdueCount" values={{ count: overdue }} />
            </p>
            <Table.Root caption={<Message id="emergency.caption" />} captionHidden>
              <Table.Head>
                <Table.Row>
                  <Table.HeaderCell>
                    <Message id="emergency.column.holder" />
                  </Table.HeaderCell>
                  <Table.HeaderCell>
                    <Message id="emergency.column.heldSince" />
                  </Table.HeaderCell>
                  <Table.HeaderCell>
                    <Message id="emergency.column.lastUsed" />
                  </Table.HeaderCell>
                  <Table.HeaderCell>
                    <Message id="emergency.column.uses" />
                  </Table.HeaderCell>
                  <Table.HeaderCell>
                    <Message id="emergency.column.due" />
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {grants.map((grant) => (
                  <Table.Row key={grant.grant_id}>
                    <Table.Cell>
                      <Link
                        to="/principals/$principalId"
                        params={{ principalId: grant.principal_id }}
                        className={styles['link']}
                      >
                        {grant.principal_id}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      <FormattedDate value={grant.held_since} dateStyle="medium" timeStyle="short" />
                    </Table.Cell>
                    <Table.Cell>
                      {grant.last_used_at === null ? (
                        <Message id="emergency.never" />
                      ) : (
                        <FormattedDate value={grant.last_used_at} dateStyle="medium" timeStyle="short" />
                      )}
                    </Table.Cell>
                    <Table.Cell>{grant.uses}</Table.Cell>
                    <Table.Cell>
                      <StatusPill tone={grant.overdue ? 'danger' : 'success'}>
                        <Message id={grant.overdue ? 'emergency.overdue' : 'emergency.inDate'} />
                      </StatusPill>{' '}
                      <FormattedDate value={grant.due_at} dateStyle="medium" />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </>
        )}
      </Panel.Body>
    </Panel.Root>
  );
}

// EmergencyGrantsPage is the validation report of break-glass provider authority (ADR-ORG-002 §5.2,
// TDD-identity-experience-003 §Emergency Grants): each emergency grant identity-control holds, with
// its last use, the oldest due first. It offers no command. A grant is Organization Control's record,
// granted and revoked there; validating one is a drill, a request its holder makes on purpose with a
// reason that says so, which the API records as a use.
export function EmergencyGrantsPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Message id="emergency.eyebrow" />
        </p>
        <h1 className={styles['title']}>
          <Message id="emergency.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="emergency.lead" />
        </p>
      </header>
      {session.data?.authenticated === true ? (
        <>
          <Grants />
          <p className={styles['quiet']}>
            <Message id="emergency.drill" />
          </p>
        </>
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
