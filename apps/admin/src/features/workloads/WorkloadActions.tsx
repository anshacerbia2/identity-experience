import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { MutationError } from '@identity-experience/app-core/api';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { Button, Icon, Panel, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import { workloadActions, type Workload, type WorkloadAction } from '@/domain/workload';

import { useWorkloadAction } from './workloads-api';
import styles from './WorkloadsPage.module.scss';

const copy: Readonly<
  Record<WorkloadAction, { readonly title: MessageKey; readonly body: MessageKey; readonly done: MessageKey }>
> = {
  suspend: {
    title: 'workloads.lifecycle.suspend.title',
    body: 'workloads.lifecycle.suspend.body',
    done: 'workloads.lifecycle.done.suspend',
  },
  restore: {
    title: 'workloads.lifecycle.restore.title',
    body: 'workloads.lifecycle.restore.body',
    done: 'workloads.lifecycle.done.restore',
  },
  retire: {
    title: 'workloads.lifecycle.retire.title',
    body: 'workloads.lifecycle.retire.body',
    done: 'workloads.lifecycle.done.retire',
  },
};

// A retirement deletes the client and retires the Principal, so a click alone does not take it: the
// client_key is typed out, as a registration's retirement asks (TDD-identity-experience-003).
function ActionForm({
  workload,
  action,
  onDone,
  onCancel,
}: {
  readonly workload: Workload;
  readonly action: WorkloadAction;
  readonly onDone: (action: WorkloadAction) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const t = useMessage();
  const mutation = useWorkloadAction(workload.principal_id);
  const form = useForm<{ reason: string; confirmation: string }>({
    defaultValues: { reason: '', confirmation: '' },
  });
  const submit = form.handleSubmit((values) => {
    mutation.mutate(
      { action, reason: values.reason },
      {
        onSuccess: () => {
          onDone(action);
        },
      },
    );
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id={copy[action].title} />
        </Panel.Title>
        <Panel.Description>
          <Message id={copy[action].body} />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {action === 'retire' ? (
          <TextField
            {...form.register('confirmation', {
              validate: (value) => value === workload.client_key || t('lifecycle.retire.confirm.mismatch'),
            })}
            label={
              <Message id="lifecycle.retire.confirm.label" values={{ clientKey: workload.client_key }} />
            }
            error={form.formState.errors.confirmation?.message}
            autoComplete="off"
            spellCheck={false}
            required
          />
        ) : null}
        {mutation.isError ? <MutationError error={mutation.error} /> : null}
        <div className={styles['actions']}>
          <Button
            type="submit"
            variant={action === 'retire' ? 'danger' : 'primary'}
            disabled={mutation.isPending}
            icon={<Icon name={action === 'restore' ? 'check' : 'shield'} />}
          >
            <Message id={`lifecycle.${action}`} />
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={mutation.isPending}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

// WorkloadActions offers the suspension, restoration and retirement the API accepts for the workload
// as it stands (TDD-identity-control-004 §Suspension, Restoration, and Retirement), and nothing else.
export function WorkloadActions({ workload }: { readonly workload: Workload }): ReactElement | null {
  const [open, setOpen] = useState<WorkloadAction | null>(null);
  const [done, setDone] = useState<WorkloadAction | null>(null);
  const actions = workloadActions(workload);
  if (actions.length === 0 && done === null) {
    return null;
  }
  const selected = open !== null && actions.includes(open) ? open : null;
  return (
    <section className={styles['section']} aria-labelledby="workload-lifecycle-title">
      <h3 id="workload-lifecycle-title" className={styles['sectionTitle']}>
        <Message id="lifecycle.title" />
      </h3>
      <p className={styles['quiet']}>
        <Message id="workloads.lifecycle.description" />
      </p>
      {done === null ? null : (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id={copy[done].done} />
        </p>
      )}
      {actions.length === 0 ? null : (
        <div className={styles['actions']}>
          {actions.map((action) => (
            <Button
              key={action}
              variant={action === 'retire' ? 'danger' : 'secondary'}
              size="sm"
              aria-expanded={selected === action}
              onClick={() => {
                setOpen(action);
                setDone(null);
              }}
            >
              <Message id={`lifecycle.${action}`} />
            </Button>
          ))}
        </div>
      )}
      {selected === null ? null : (
        <ActionForm
          key={selected}
          workload={workload}
          action={selected}
          onDone={(action) => {
            setOpen(null);
            setDone(action);
          }}
          onCancel={() => {
            setOpen(null);
          }}
        />
      )}
    </section>
  );
}
