import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { Button, Icon, Panel, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import type { ParkedOperation, SecurityOperation } from '@/domain/security';

import styles from './PrincipalsPage.module.scss';
import { useParkedOperations, useRedrive } from './security-api';

const typeLabel: Readonly<Record<string, MessageKey>> = {
  suspend: 'operations.type.suspend',
  restore: 'operations.type.restore',
  'sessions.terminate-all': 'operations.type.terminateAll',
  'authenticator.revoke': 'operations.type.revoke',
  'session.terminate': 'operations.type.sessionTerminate',
  'authenticator.remove': 'operations.type.authenticatorRemove',
};

function OperationType({ type }: { readonly type: string }): ReactElement {
  const label = typeLabel[type];
  return label === undefined ? <code>{type}</code> : <Message id={label} />;
}

function RedriveForm({
  operation,
  onDone,
  onCancel,
}: {
  readonly operation: ParkedOperation;
  readonly onDone: (result: SecurityOperation) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const redrive = useRedrive();
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    redrive.mutate({ operationId: operation.operation_id, reason: values.reason }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="operations.redrive.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="operations.redrive.body" />
        </Panel.Description>
      </Panel.Header>
      <p className={styles['subject']}>
        <code>{operation.operation_id}</code>
      </p>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {redrive.isError ? <MutationError error={redrive.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" disabled={redrive.isPending} icon={<Icon name="pulse" />}>
            <Message id="operations.redrive" />
          </Button>
          <Button variant="ghost" disabled={redrive.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
        {redrive.isPending ? (
          <p className={styles['quiet']} role="status">
            <Message id="principals.contain.sending" />
          </p>
        ) : null}
      </form>
    </Panel.Root>
  );
}

// RedriveOutcome states where a re-driven operation came to, as a containment command's outcome does.
function RedriveOutcome({ operation }: { readonly operation: SecurityOperation }): ReactElement {
  switch (operation.state) {
    case 'applied':
      return (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id="operations.redrive.applied" />
        </p>
      );
    case 'refused':
      return (
        <p className={styles['quiet']} role="alert">
          <Message id="operations.redrive.refused" values={{ code: operation.result_code ?? '' }} />
        </p>
      );
    case 'unresolved':
      return (
        <p className={styles['quiet']} role="alert">
          <Message id="operations.redrive.parked" values={{ id: operation.operation_id }} />
        </p>
      );
    default:
      return (
        <p className={styles['quiet']} role="status">
          <Message id="principals.contain.running" values={{ id: operation.operation_id }} />
        </p>
      );
  }
}

// ParkedOperations lists the security operations the executor parked, which block their Principal's
// later commands, and re-drives one with a reason (TDD-identity-experience-003 §Principal Search and
// Security State, TDD-identity-control-005 §Operating the Executor). There is no abandon: the API has
// none, and a parked operation is resolved by fixing its cause and re-driving it.
export function ParkedOperations(): ReactElement {
  const parked = useParkedOperations();
  const [redriving, setRedriving] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SecurityOperation | null>(null);

  let body: ReactElement;
  if (parked.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (parked.isError) {
    body = (
      <ApiErrorPanel
        error={parked.error}
        onRetry={() => {
          void parked.refetch();
        }}
      />
    );
  } else if (parked.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="operations.empty" />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id="operations.caption" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="operations.column.principal" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="operations.column.type" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="operations.column.attempts" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="operations.column.error" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="operations.column.created" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="findings.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {parked.data.map((operation) => (
            <Table.Row key={operation.operation_id}>
              <Table.Cell mono>
                <Link to="/principals/$principalId" params={{ principalId: operation.principal_id }}>
                  {operation.principal_id}
                </Link>
              </Table.Cell>
              <Table.Cell>
                <OperationType type={operation.operation_type} />
              </Table.Cell>
              <Table.Cell>{operation.attempts}</Table.Cell>
              <Table.Cell mono>{operation.last_error_class ?? ''}</Table.Cell>
              <Table.Cell>
                <FormattedDate value={operation.created_at} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-expanded={redriving === operation.operation_id}
                  onClick={() => {
                    setRedriving(operation.operation_id);
                    setOutcome(null);
                  }}
                >
                  <Message id="operations.redrive.open" values={{ id: operation.operation_id }} />
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }

  const selected =
    redriving === null || !parked.isSuccess
      ? undefined
      : parked.data.find((operation) => operation.operation_id === redriving);

  return (
    <section className={styles['section']} aria-labelledby="parked-title">
      <h2 id="parked-title" className={styles['sectionTitle']}>
        <Message id="operations.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="operations.description" />
      </p>
      {outcome === null ? null : <RedriveOutcome operation={outcome} />}
      {body}
      {selected === undefined ? null : (
        <RedriveForm
          key={selected.operation_id}
          operation={selected}
          onDone={(result) => {
            setRedriving(null);
            setOutcome(result);
          }}
          onCancel={() => {
            setRedriving(null);
          }}
        />
      )}
    </section>
  );
}
