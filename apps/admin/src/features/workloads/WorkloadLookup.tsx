import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { Button, Icon, Panel, StatusPill, TextField, type StatusTone } from '@identity-experience/ui';

import { ApiErrorPanel } from '@/core/api/ApiErrorPanel';
import { MutationError } from '@/core/api/MutationError';
import { ReasonField, reasonRules } from '@/core/forms/ReasonField';
import { Message, useMessage } from '@/core/i18n/Message';
import { isPrincipalId } from '@/domain/principal';
import type { Workload, WorkloadState } from '@/domain/workload';

import { useReassign, useWorkload } from './workloads-api';
import styles from './WorkloadsPage.module.scss';

const tones: Readonly<Record<WorkloadState, StatusTone>> = {
  pending: 'warning',
  active: 'success',
  orphaned: 'danger',
  suspended: 'danger',
  retired: 'neutral',
};

function ReassignForm({
  workload,
  onDone,
  onCancel,
}: {
  readonly workload: Workload;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const t = useMessage();
  const reassign = useReassign();
  const form = useForm<{ owner: string; reason: string }>({ defaultValues: { owner: '', reason: '' } });
  const submit = form.handleSubmit((values) => {
    reassign.mutate(
      {
        principalId: workload.principal_id,
        request: { owner_principal_id: values.owner.trim() },
        reason: values.reason,
      },
      { onSuccess: onDone },
    );
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="workloads.reassign.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="workloads.reassign.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          {...form.register('owner', {
            validate: (value) =>
              !isPrincipalId(value)
                ? t('workloads.create.owner.invalid')
                : value.trim().toLowerCase() !== workload.owner_principal_id.toLowerCase() ||
                  t('workloads.reassign.same'),
          })}
          label={<Message id="workloads.reassign.owner" />}
          error={form.formState.errors.owner?.message}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {reassign.isError ? <MutationError error={reassign.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" disabled={reassign.isPending} icon={<Icon name="users" />}>
            <Message id="workloads.reassign" />
          </Button>
          <Button variant="ghost" disabled={reassign.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

function Details({ workload }: { readonly workload: Workload }): ReactElement {
  const [reassigning, setReassigning] = useState(false);
  const [reassigned, setReassigned] = useState(false);
  const movable = workload.state === 'active' || workload.state === 'orphaned';
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>{workload.display_name}</Panel.Title>
        <Panel.Description>{workload.purpose}</Panel.Description>
      </Panel.Header>
      <Panel.Body>
        <dl className={styles['details']}>
          <dt>
            <Message id="workloads.detail.state" />
          </dt>
          <dd>
            <StatusPill tone={tones[workload.state]}>
              <Message id={`workloads.state.${workload.state}`} />
            </StatusPill>
          </dd>
          <dt>
            <Message id="workloads.detail.principal" />
          </dt>
          <dd className={styles['mono']}>{workload.principal_id}</dd>
          <dt>
            <Message id="workloads.create.clientKey" />
          </dt>
          <dd className={styles['mono']}>{workload.client_key}</dd>
          <dt>
            <Message id="workloads.create.type" />
          </dt>
          <dd>
            <Message id={`workloads.type.${workload.workload_type}`} />
          </dd>
          <dt>
            <Message id="workloads.create.owner" />
          </dt>
          <dd className={styles['mono']}>{workload.owner_principal_id}</dd>
          <dt>
            <Message id="workloads.create.team" />
          </dt>
          <dd>{workload.team_reference ?? <Message id="workloads.detail.none" />}</dd>
          <dt>
            <Message id="workloads.detail.ownerSince" />
          </dt>
          <dd>
            <FormattedDate value={workload.owner_recorded_at} dateStyle="medium" timeStyle="short" />
          </dd>
          <dt>
            <Message id="workloads.detail.created" />
          </dt>
          <dd>
            <FormattedDate value={workload.created_at} dateStyle="medium" timeStyle="short" />
          </dd>
        </dl>
        {reassigned ? (
          <p className={styles['success']} role="status">
            <Icon name="check" />
            <Message id="workloads.reassign.done" />
          </p>
        ) : null}
        {movable && !reassigning ? (
          <div className={styles['actions']}>
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon name="users" />}
              onClick={() => {
                setReassigning(true);
                setReassigned(false);
              }}
            >
              <Message id="workloads.reassign" />
            </Button>
          </div>
        ) : null}
      </Panel.Body>
      {reassigning ? (
        <ReassignForm
          workload={workload}
          onDone={() => {
            setReassigning(false);
            setReassigned(true);
          }}
          onCancel={() => {
            setReassigning(false);
          }}
        />
      ) : null}
    </Panel.Root>
  );
}

// WorkloadLookup finds one workload by its principal_id and moves it to a new owner. There is no list
// of every workload: a directory of machine credentials is what an attacker reads first, and the
// Identity Control API offers none.
export function WorkloadLookup(): ReactElement {
  const t = useMessage();
  const [principalId, setPrincipalId] = useState<string | null>(null);
  const workload = useWorkload(principalId);
  const form = useForm<{ principalId: string }>({ defaultValues: { principalId: '' } });
  const submit = form.handleSubmit((values) => {
    setPrincipalId(values.principalId.trim().toLowerCase());
  });

  let body: ReactElement | null = null;
  if (principalId !== null) {
    if (workload.isPending) {
      body = <Panel.Root aria-busy="true" />;
    } else if (workload.isError) {
      body = (
        <ApiErrorPanel
          error={workload.error}
          onRetry={() => {
            void workload.refetch();
          }}
        />
      );
    } else {
      body = <Details key={workload.data.principal_id} workload={workload.data} />;
    }
  }

  return (
    <section className={styles['section']} aria-labelledby="lookup-title">
      <h2 id="lookup-title" className={styles['sectionTitle']}>
        <Message id="workloads.lookup.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="workloads.lookup.body" />
      </p>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          {...form.register('principalId', {
            validate: (value) => isPrincipalId(value) || t('workloads.create.owner.invalid'),
          })}
          label={<Message id="workloads.lookup.field" />}
          error={form.formState.errors.principalId?.message}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <div className={styles['actions']}>
          <Button type="submit" variant="secondary" icon={<Icon name="arrow" />}>
            <Message id="workloads.lookup.submit" />
          </Button>
        </div>
      </form>
      {body}
    </section>
  );
}
