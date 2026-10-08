import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import { reviewOverdue } from '@identity-experience/app-core/domain/workload';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import { workloadTones } from './labels';
import { useMyWorkloads } from './workloads-api';
import styles from './WorkloadsPage.module.scss';

function MyWorkloads(): ReactElement {
  const mine = useMyWorkloads();
  if (mine.isPending) {
    return (
      <p className={styles['quiet']} role="status">
        <Message id="workloads.loading" />
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
            <Message id="workloads.empty.title" />
          </Panel.Title>
          <Panel.Description>
            <Message id="workloads.empty.body" />
          </Panel.Description>
        </Panel.Header>
      </Panel.Root>
    );
  }
  const now = new Date();
  return (
    <Table.Root caption={<Message id="workloads.caption" />} captionHidden>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>
            <Message id="workloads.column.workload" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="mine.column.client" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="mine.column.state" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="workload.detail.reviewed" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="workload.detail.reviewDue" />
          </Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {mine.data.map((workload) => (
          <Table.Row key={workload.principal_id}>
            <Table.Cell>
              <Link
                to="/workloads/$principalId"
                params={{ principalId: workload.principal_id }}
                className={styles['clientLink']}
              >
                {workload.display_name}
              </Link>
            </Table.Cell>
            <Table.Cell mono>{workload.client_key}</Table.Cell>
            <Table.Cell>
              <StatusPill tone={workloadTones[workload.state]}>
                <Message id={`workloads.state.${workload.state}`} />
              </StatusPill>
            </Table.Cell>
            <Table.Cell>
              {workload.last_reviewed_at === undefined || workload.last_reviewed_at === null ? (
                <Message id="workload.detail.never" />
              ) : (
                <FormattedDate value={workload.last_reviewed_at} dateStyle="medium" />
              )}
            </Table.Cell>
            <Table.Cell>
              {workload.review_due_at === undefined ? (
                <Message id="workload.detail.none" />
              ) : (
                <>
                  <FormattedDate value={workload.review_due_at} dateStyle="medium" />{' '}
                  {reviewOverdue(workload, now) ? (
                    <StatusPill tone="danger">
                      <Message id="workloads.overdue" />
                    </StatusPill>
                  ) : null}
                </>
              )}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

// MyWorkloadsPage lists the workloads the signed-in person is the accountable owner of (ADR-IAM-003
// §5.8, TDD-identity-experience-004 §Ownership), each with its last review and the date the next is
// due, so an owner reviews before the review is overdue. Which workloads a person owns is the Identity
// Control API's record: the page shows what GET /v1/workloads:mine answers and decides nothing.
export function MyWorkloadsPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Message id="mine.eyebrow" />
        </p>
        <h1 className={styles['title']}>
          <Message id="workloads.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="workloads.lead" />
        </p>
      </header>
      {session.data?.authenticated === true ? <MyWorkloads /> : session.isPending ? null : <SignInRequired />}
    </div>
  );
}
