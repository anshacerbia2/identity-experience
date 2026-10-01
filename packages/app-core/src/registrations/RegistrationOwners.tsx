import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { Panel, StatusPill, Table } from '@identity-experience/ui';

import { useOwners } from './registration-api';
import styles from './Registration.module.scss';
import { ApiErrorPanel } from '../api/ApiErrorPanel';
import { activeOwners } from '../domain/registration';
import { CoreMessage } from '../i18n/CoreMessage';
import { useSession } from '../session/session';

// RegistrationOwners lists who is accountable for a registration now (ADR-IAM-003). It is read-only:
// a provider grants and revokes ownership, with a reason, and an owner cannot add another owner or
// remove one. Revoked ownerships stay in the API's record and are not listed here.
export function RegistrationOwners({ registrationId }: { readonly registrationId: string }): ReactElement {
  const owners = useOwners(registrationId);
  const session = useSession();
  const me = session.data?.authenticated === true ? session.data.principalId : null;

  let body: ReactElement;
  if (owners.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (owners.isError) {
    body = (
      <ApiErrorPanel
        error={owners.error}
        onRetry={() => {
          void owners.refetch();
        }}
      />
    );
  } else {
    const active = activeOwners(owners.data);
    body =
      active.length === 0 ? (
        <p className={styles['quiet']} role="status">
          <CoreMessage id="owners.empty" />
        </p>
      ) : (
        <Table.Root caption={<CoreMessage id="owners.caption" />} captionHidden>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>
                <CoreMessage id="owners.column.principal" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <CoreMessage id="owners.column.granted" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <CoreMessage id="owners.column.reason" />
              </Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {active.map((owner) => (
              <Table.Row key={owner.ownership_id}>
                <Table.Cell mono>
                  <span className={styles['stack']}>
                    {owner.principal_id}
                    {owner.principal_id === me ? (
                      <StatusPill tone="info">
                        <CoreMessage id="owners.you" />
                      </StatusPill>
                    ) : null}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <FormattedDate value={owner.granted_at} dateStyle="medium" timeStyle="short" />
                </Table.Cell>
                <Table.Cell>{owner.grant_reason}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      );
  }

  return (
    <section className={styles['section']} aria-labelledby="owners-title">
      <h2 id="owners-title" className={styles['sectionTitle']}>
        <CoreMessage id="owners.title" />
      </h2>
      <p className={styles['quiet']}>
        <CoreMessage id="owners.description" />
      </p>
      {body}
    </section>
  );
}
