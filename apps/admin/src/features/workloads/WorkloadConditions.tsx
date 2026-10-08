import { useState, type ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import { Button, Icon, Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import { workloadConditions, type ConditionRow, type WorkloadCondition } from '@/domain/workload';

import { useWorkloadCondition, useWorkloadSweep } from './workloads-api';
import styles from './WorkloadsPage.module.scss';

const copy: Readonly<
  Record<
    WorkloadCondition,
    {
      readonly title: MessageKey;
      readonly description: MessageKey;
      readonly empty: MessageKey;
      readonly since: MessageKey;
      readonly caption: MessageKey;
    }
  >
> = {
  orphaned: {
    title: 'workloads.conditions.orphaned.title',
    description: 'workloads.conditions.orphaned.description',
    empty: 'workloads.conditions.orphaned.empty',
    since: 'workloads.conditions.orphaned.since',
    caption: 'workloads.conditions.orphaned.caption',
  },
  unused: {
    title: 'workloads.conditions.unused.title',
    description: 'workloads.conditions.unused.description',
    empty: 'workloads.conditions.unused.empty',
    since: 'workloads.conditions.unused.since',
    caption: 'workloads.conditions.unused.caption',
  },
  'reviews-overdue': {
    title: 'workloads.conditions.overdue.title',
    description: 'workloads.conditions.overdue.description',
    empty: 'workloads.conditions.overdue.empty',
    since: 'workloads.conditions.overdue.since',
    caption: 'workloads.conditions.overdue.caption',
  },
};

const stageLabel: Readonly<Record<NonNullable<ConditionRow['stage']>, MessageKey>> = {
  reminder: 'workloads.conditions.stage.reminder',
  escalated: 'workloads.conditions.stage.escalated',
  suspended: 'workloads.conditions.stage.suspended',
};

// ConditionList is one of the sweep's listings, read only when the operator opens it.
function ConditionList({
  condition,
  onOpen,
}: {
  readonly condition: WorkloadCondition;
  readonly onOpen: (principalId: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const rows = useWorkloadCondition(condition, open);
  const text = copy[condition];

  let body: ReactElement;
  if (!open) {
    body = (
      <Button
        variant="secondary"
        size="sm"
        icon={<Icon name="arrow" />}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Message id="workloads.conditions.show" />
      </Button>
    );
  } else if (rows.isPending) {
    body = <div aria-busy="true" />;
  } else if (rows.isError) {
    body = (
      <ApiErrorPanel
        error={rows.error}
        onRetry={() => {
          void rows.refetch();
        }}
      />
    );
  } else if (rows.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id={text.empty} />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id={text.caption} />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="workloads.conditions.column.workload" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="workloads.create.owner" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="workloads.detail.state" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id={text.since} />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="findings.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {rows.data.map((row) => (
            <Table.Row key={row.principal_id}>
              <Table.Cell>
                <span className={styles['subject']}>
                  {row.display_name} <code>{row.client_key}</code>
                </span>
              </Table.Cell>
              <Table.Cell mono>{row.owner_principal_id}</Table.Cell>
              <Table.Cell>
                <Message id={`workloads.state.${row.state}`} />
                {row.stage === undefined ? null : (
                  <>
                    {' '}
                    <StatusPill tone={row.stage === 'reminder' ? 'warning' : 'danger'}>
                      <Message id={stageLabel[row.stage]} />
                    </StatusPill>
                  </>
                )}
              </Table.Cell>
              <Table.Cell>
                <FormattedDate value={row.since} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onOpen(row.principal_id);
                  }}
                >
                  <Message id="workloads.conditions.open" values={{ name: row.display_name }} />
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }

  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id={text.title} />
        </Panel.Title>
        <Panel.Description>
          <Message id={text.description} />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>{body}</Panel.Body>
    </Panel.Root>
  );
}

// WorkloadConditions is what the workload sweep finds: orphaned workloads, unused ones, and overdue
// owner reviews (TDD-identity-experience-003 §Workloads, TDD-identity-control-004 1.5.0). Each list
// is read only when opened, so the page still lists nothing until asked; a row opens its workload in
// the lookup below. The sweep can be run now, as the schedule runs it.
export function WorkloadConditions({
  onOpen,
}: {
  readonly onOpen: (principalId: string) => void;
}): ReactElement {
  const sweep = useWorkloadSweep();
  return (
    <section className={styles['section']} aria-labelledby="conditions-title">
      <h2 id="conditions-title" className={styles['sectionTitle']}>
        <Message id="workloads.conditions.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="workloads.conditions.description" />
      </p>
      <div className={styles['actions']}>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="pulse" />}
          disabled={sweep.isPending}
          onClick={() => {
            sweep.mutate();
          }}
        >
          <Message id="workloads.sweep" />
        </Button>
        {sweep.isSuccess ? (
          <p className={styles['quiet']} role="status">
            <Message id="workloads.sweep.done" values={{ ...sweep.data }} />
          </p>
        ) : null}
      </div>
      {sweep.isError ? <MutationError error={sweep.error} /> : null}
      {workloadConditions.map((condition) => (
        <ConditionList key={condition} condition={condition} onOpen={onOpen} />
      ))}
    </section>
  );
}
