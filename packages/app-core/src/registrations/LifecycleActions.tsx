import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { Button, Icon, Panel, TextField } from '@identity-experience/ui';

import { useLifecycle } from './registration-api';
import styles from './Registration.module.scss';
import { MutationError } from '../api/MutationError';
import { lifecycleActions, type LifecycleAction, type Registration } from '../domain/registration';
import { ReasonField, reasonRules } from '../forms/ReasonField';
import type { CoreMessageKey as MessageKey } from '../i18n/core-messages';
import { CoreMessage as Message, useCoreMessage } from '../i18n/CoreMessage';

interface Values {
  readonly reason: string;
  readonly confirmation: string;
}

const copy: Readonly<
  Record<
    LifecycleAction,
    { readonly title: MessageKey; readonly body: MessageKey; readonly done: MessageKey }
  >
> = {
  suspend: {
    title: 'lifecycle.suspend.title',
    body: 'lifecycle.suspend.body',
    done: 'lifecycle.done.suspend',
  },
  restore: {
    title: 'lifecycle.restore.title',
    body: 'lifecycle.restore.body',
    done: 'lifecycle.done.restore',
  },
  retire: { title: 'lifecycle.retire.title', body: 'lifecycle.retire.body', done: 'lifecycle.done.retire' },
};

// A retirement cannot be undone, so it is the one action a click alone does not take: the client_key
// is typed out, as retiring a Principal asks for its identifier (TDD-identity-experience-003).
function LifecycleForm({
  registration,
  action,
  onDone,
  onCancel,
}: {
  readonly registration: Registration;
  readonly action: LifecycleAction;
  readonly onDone: (action: LifecycleAction) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const t = useCoreMessage();
  const lifecycle = useLifecycle(registration.registration_id);
  const form = useForm<Values>({ defaultValues: { reason: '', confirmation: '' } });
  const submit = form.handleSubmit((values) => {
    lifecycle.mutate(
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
              validate: (value) =>
                value === registration.client_key || t('lifecycle.retire.confirm.mismatch'),
            })}
            label={
              <Message id="lifecycle.retire.confirm.label" values={{ clientKey: registration.client_key }} />
            }
            error={form.formState.errors.confirmation?.message}
            autoComplete="off"
            spellCheck={false}
            required
          />
        ) : null}
        {lifecycle.isError ? <MutationError error={lifecycle.error} /> : null}
        <div className={styles['formActions']}>
          <Button
            type="submit"
            variant={action === 'retire' ? 'danger' : 'primary'}
            disabled={lifecycle.isPending}
            icon={<Icon name={action === 'restore' ? 'check' : 'shield'} />}
          >
            <Message id={`lifecycle.${action}`} />
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={lifecycle.isPending}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

// What an owner may do to its registration's lifecycle (ADR-IAM-003): suspend and restore.
// Retirement is a provider's.
const ownerActions: readonly LifecycleAction[] = ['suspend', 'restore'];

// LifecycleActions offers the suspension, restoration and retirement the API accepts for this
// registration as it stands (ADR-IAM-001 §5.13), and nothing else: a workload's client is stopped
// through its workload, and a retired registration has nothing left to stop. For an owner, only
// what the API accepts from an owner.
export function LifecycleActions({
  registration,
  owner = false,
}: {
  readonly registration: Registration;
  readonly owner?: boolean;
}): ReactElement | null {
  const [open, setOpen] = useState<LifecycleAction | null>(null);
  const [done, setDone] = useState<LifecycleAction | null>(null);
  const actions = lifecycleActions(registration).filter((action) => !owner || ownerActions.includes(action));
  if (actions.length === 0 && done === null) {
    return null;
  }
  const selected = open !== null && actions.includes(open) ? open : null;
  return (
    <section className={styles['section']} aria-labelledby="lifecycle-title">
      <h2 id="lifecycle-title" className={styles['sectionTitle']}>
        <Message id="lifecycle.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id={owner ? 'lifecycle.description.owner' : 'lifecycle.description'} />
      </p>
      {done === null ? null : (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id={copy[done].done} />
        </p>
      )}
      {actions.length === 0 ? null : (
        <div className={styles['formActions']}>
          {actions.map((action) => (
            <Button
              key={action}
              variant={action === 'retire' ? 'danger' : 'secondary'}
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
        <LifecycleForm
          key={selected}
          registration={registration}
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
