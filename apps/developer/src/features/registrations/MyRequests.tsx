import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import type {
  RegistrationRequestRecord,
  RequestState,
} from '@identity-experience/app-core/domain/registration';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { useDecideRequest, useMyRequests } from '@identity-experience/app-core/registrations';
import { Button, Icon, Panel, StatusPill, Table, type StatusTone } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import styles from './MyRegistrationsPage.module.scss';

const tones: Readonly<Record<RequestState, StatusTone>> = {
  proposed: 'info',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};

function WithdrawForm({
  request,
  onDone,
  onCancel,
}: {
  readonly request: RegistrationRequestRecord;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const decide = useDecideRequest();
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    decide.mutate(
      { requestId: request.request_id, decision: 'withdraw', reason: values.reason },
      { onSuccess: onDone },
    );
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="requests.withdraw.title" values={{ clientKey: request.client_key }} />
        </Panel.Title>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {decide.isError ? <MutationError error={decide.error} /> : null}
        <div className={styles['formActions']}>
          <Button type="submit" variant="danger" disabled={decide.isPending}>
            <Message id="requests.withdraw" />
          </Button>
          <Button variant="ghost" disabled={decide.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

// MyRequests lists the person's production registration requests (TDD-identity-experience-004
// §Registering a Client): each with its state, the decision's reason, and the registration an
// approval created. An open one is withdrawn with a reason.
export function MyRequests(): ReactElement | null {
  const requests = useMyRequests(true);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  if (requests.isPending) {
    return null;
  }
  if (requests.isError) {
    return (
      <ApiErrorPanel
        error={requests.error}
        onRetry={() => {
          void requests.refetch();
        }}
      />
    );
  }
  if (requests.data.length === 0) {
    return null;
  }
  const selected = requests.data.find(
    (request) => request.request_id === withdrawing && request.state === 'proposed',
  );
  return (
    <section className={styles['root']} aria-labelledby="requests-title">
      <h2 id="requests-title" className={styles['sectionTitle']}>
        <Message id="requests.title" />
      </h2>
      <Table.Root caption={<Message id="requests.caption" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="mine.column.client" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="mine.column.state" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="requests.column.proposed" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="requests.column.decision" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="requests.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {requests.data.map((request) => (
            <Table.Row key={request.request_id}>
              <Table.Cell mono>
                {request.registration_id === null ? (
                  request.client_key
                ) : (
                  <Link
                    to="/registrations/$registrationId"
                    params={{ registrationId: request.registration_id }}
                    className={styles['clientLink']}
                  >
                    {request.client_key}
                  </Link>
                )}
              </Table.Cell>
              <Table.Cell>
                <StatusPill tone={tones[request.state]}>
                  <Message id={`requests.state.${request.state}`} />
                </StatusPill>
              </Table.Cell>
              <Table.Cell>
                <FormattedDate value={request.proposed_at} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell>{request.decision_reason ?? ''}</Table.Cell>
              <Table.Cell>
                {request.state === 'proposed' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-expanded={withdrawing === request.request_id}
                    onClick={() => {
                      setWithdrawing(request.request_id);
                    }}
                  >
                    <Message id="requests.withdraw.open" values={{ clientKey: request.client_key }} />
                  </Button>
                ) : null}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      {selected === undefined ? null : (
        <WithdrawForm
          key={selected.request_id}
          request={selected}
          onDone={() => {
            setWithdrawing(null);
          }}
          onCancel={() => {
            setWithdrawing(null);
          }}
        />
      )}
      <p className={styles['quiet']}>
        <Icon name="shield" />
        <Message id="requests.note" />
      </p>
    </section>
  );
}
