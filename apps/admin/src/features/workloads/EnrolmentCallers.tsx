import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { Sheet } from '@identity-experience/app-core/shell';
import { Button, Icon, Panel, StatusPill, Table, TextAreaField, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';
import { isActiveCaller, purposeMaxLength } from '@/domain/enrolment';

import { useEnrolmentCallers, useRegisterEnrolmentCaller, useRetireEnrolmentCaller } from './workloads-api';
import styles from './WorkloadsPage.module.scss';

const principalPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function RegisterForm({
  onDone,
  onCancel,
}: {
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const t = useMessage();
  const register = useRegisterEnrolmentCaller();
  const form = useForm<{ principalId: string; purpose: string; reason: string }>({
    defaultValues: { principalId: '', purpose: '', reason: '' },
  });
  const submit = form.handleSubmit((values) => {
    register.mutate(
      {
        request: { principal_id: values.principalId.trim(), purpose: values.purpose.trim() },
        reason: values.reason,
      },
      { onSuccess: onDone },
    );
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="enrolmentCallers.register.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="enrolmentCallers.register.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          {...form.register('principalId', {
            validate: (value) =>
              principalPattern.test(value.trim()) || t('enrolmentCallers.register.principal.invalid'),
          })}
          label={<Message id="enrolmentCallers.register.principal" />}
          error={form.formState.errors.principalId?.message}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <TextAreaField
          {...form.register('purpose', {
            validate: (value) => {
              const trimmed = value.trim();
              if (trimmed === '') {
                return t('enrolmentCallers.register.purpose.required');
              }
              return (
                trimmed.length <= purposeMaxLength ||
                t('enrolmentCallers.register.purpose.long', { max: purposeMaxLength })
              );
            },
          })}
          label={<Message id="enrolmentCallers.register.purpose" />}
          description={<Message id="enrolmentCallers.register.purpose.hint" />}
          error={form.formState.errors.purpose?.message}
          rows={2}
          required
        />
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {register.isError ? <MutationError error={register.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" disabled={register.isPending}>
            <Icon name="key" />
            <Message id="enrolmentCallers.register" />
          </Button>
          <Button variant="ghost" disabled={register.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

function RetireForm({
  principalId,
  onDone,
  onCancel,
}: {
  readonly principalId: string;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const retire = useRetireEnrolmentCaller();
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    retire.mutate({ principalId, reason: values.reason }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="enrolmentCallers.retire.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="enrolmentCallers.retire.body" />
        </Panel.Description>
      </Panel.Header>
      <p className={styles['subject']}>
        <code>{principalId}</code>
      </p>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {retire.isError ? <MutationError error={retire.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" variant="danger" disabled={retire.isPending}>
            <Icon name="shield" />
            <Message id="enrolmentCallers.retire" />
          </Button>
          <Button variant="ghost" disabled={retire.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

// EnrolmentCallers lists the workloads identity-control admits to the enrolment routes, and lets a
// provider register one and retire it, each with a reason (ADR-IAM-011 §5.8;
// TDD-identity-experience-003 1.35.0 §Enrolment Callers). The caller is the BFF's own enrolment
// workload, one per device (TDD-identity-experience-001 1.24.0).
export function EnrolmentCallers(): ReactElement {
  const [open, setOpen] = useState(false);
  const callers = useEnrolmentCallers(open);
  const [registering, setRegistering] = useState(false);
  const [retiring, setRetiring] = useState<string | null>(null);
  const [done, setDone] = useState<'registered' | 'retired' | null>(null);

  let body: ReactElement;
  if (!open) {
    body = (
      <div className={styles['actions']}>
        <Button
          variant="secondary"
          size="small"
          onClick={() => {
            setOpen(true);
          }}
        >
          <Icon name="arrow" />
          <Message id="enrolmentCallers.show" />
        </Button>
      </div>
    );
  } else if (callers.isPending) {
    body = <div aria-busy="true" />;
  } else if (callers.isError) {
    body = (
      <ApiErrorPanel
        error={callers.error}
        onRetry={() => {
          void callers.refetch();
        }}
      />
    );
  } else if (callers.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="enrolmentCallers.empty" />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id="enrolmentCallers.caption" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="enrolmentCallers.column.workload" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="enrolmentCallers.column.state" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="enrolmentCallers.column.purpose" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="enrolmentCallers.column.reason" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="enrolmentCallers.column.registered" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="findings.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {callers.data.map((caller) => {
            const active = isActiveCaller(caller);
            return (
              <Table.Row key={`${caller.principal_id}-${caller.registered_at}`}>
                <Table.Cell mono>{caller.principal_id}</Table.Cell>
                <Table.Cell>
                  <StatusPill tone={active ? 'success' : 'neutral'}>
                    <Message
                      id={active ? 'enrolmentCallers.state.active' : 'enrolmentCallers.state.retired'}
                    />
                  </StatusPill>
                </Table.Cell>
                <Table.Cell>{caller.purpose}</Table.Cell>
                <Table.Cell>{caller.retire_reason ?? caller.register_reason}</Table.Cell>
                <Table.Cell>
                  <FormattedDate value={caller.registered_at} dateStyle="medium" timeStyle="short" />
                </Table.Cell>
                <Table.Cell>
                  {active ? (
                    <Button
                      variant="secondary"
                      size="small"
                      aria-expanded={retiring === caller.principal_id}
                      onClick={() => {
                        setRetiring(caller.principal_id);
                        setRegistering(false);
                        setDone(null);
                      }}
                    >
                      <Message
                        id="enrolmentCallers.retire.open"
                        values={{ principal: caller.principal_id }}
                      />
                    </Button>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    );
  }

  return (
    <Sheet
      id="enrolment-callers"
      title={<Message id="enrolmentCallers.title" />}
      description={<Message id="enrolmentCallers.description" />}
    >
      {done === null ? null : (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message
            id={done === 'registered' ? 'enrolmentCallers.done.registered' : 'enrolmentCallers.done.retired'}
          />
        </p>
      )}
      {registering ? null : (
        <div className={styles['actions']}>
          <Button
            variant="secondary"
            onClick={() => {
              setRegistering(true);
              setRetiring(null);
              setDone(null);
            }}
          >
            <Icon name="key" />
            <Message id="enrolmentCallers.register.open" />
          </Button>
        </div>
      )}
      {registering ? (
        <RegisterForm
          onDone={() => {
            setRegistering(false);
            setOpen(true);
            setDone('registered');
          }}
          onCancel={() => {
            setRegistering(false);
          }}
        />
      ) : null}
      {retiring === null ? null : (
        <RetireForm
          key={retiring}
          principalId={retiring}
          onDone={() => {
            setRetiring(null);
            setDone('retired');
          }}
          onCancel={() => {
            setRetiring(null);
          }}
        />
      )}
      {body}
    </Sheet>
  );
}
