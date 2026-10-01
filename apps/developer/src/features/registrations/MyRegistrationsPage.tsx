import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import { profileLabel, stateLabel, stateTone } from '@identity-experience/app-core/registrations';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import styles from './MyRegistrationsPage.module.scss';
import { useMyRegistrations } from './registrations-api';

function MyRegistrations(): ReactElement {
  const mine = useMyRegistrations();

  if (mine.isPending) {
    return (
      <p className={styles['quiet']} role="status">
        <Message id="mine.loading" />
      </p>
    );
  }
  if (mine.isError) {
    return (
      <ApiErrorPanel
        error={mine.error}
        onRetry={() => {
          void mine.refetch();
        }}
      />
    );
  }
  if (mine.data.length === 0) {
    return (
      <Panel.Root>
        <Panel.Header>
          <Panel.Title>
            <Message id="mine.empty.title" />
          </Panel.Title>
          <Panel.Description>
            <Message id="mine.empty.body" />
          </Panel.Description>
        </Panel.Header>
      </Panel.Root>
    );
  }
  return (
    <Table.Root caption={<Message id="mine.table.caption" />} captionHidden>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>
            <Message id="mine.column.client" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="mine.column.profile" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="mine.column.state" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="mine.column.created" />
          </Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {mine.data.map((registration) => (
          <Table.Row key={registration.registration_id}>
            <Table.Cell mono>{registration.client_key}</Table.Cell>
            <Table.Cell>
              <Message id={profileLabel(registration.profile)} />
            </Table.Cell>
            <Table.Cell>
              <StatusPill tone={stateTone[registration.state]}>
                <Message id={stateLabel(registration.state)} />
              </StatusPill>
            </Table.Cell>
            <Table.Cell>
              <FormattedDate value={registration.created_at} dateStyle="medium" timeStyle="short" />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

// MyRegistrationsPage lists the registrations the signed-in person owns (ADR-IAM-003,
// TDD-identity-experience-004 §Ownership). It shows what the Identity Control API answers for the
// owner and decides nothing: which registrations a person owns is the API's record, not this page's.
export function MyRegistrationsPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Message id="mine.eyebrow" />
        </p>
        <h1 className={styles['title']}>
          <Message id="mine.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="mine.lead" />
        </p>
      </header>
      {session.data?.authenticated === true ? (
        <MyRegistrations />
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
