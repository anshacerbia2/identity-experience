import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import type {
  ChangeDecision,
  RegistrationRequestRecord,
} from '@identity-experience/app-core/domain/registration';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { profileLabel, useDecideRequest, useRequestQueue } from '@identity-experience/app-core/registrations';
import { useSession } from '@identity-experience/app-core/session';
import { Button, Icon, Panel } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';

import styles from './ChangeQueuePage.module.scss';

const dayMs = 24 * 60 * 60 * 1000;

function Field({
  label,
  children,
}: {
  readonly label: MessageKey;
  readonly children: ReactElement | string;
}): ReactElement {
  return (
    <div className={styles['field']}>
      <dt>
        <Message id={label} />
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Values({ values }: { readonly values: readonly string[] | undefined }): ReactElement {
  if (values === undefined || values.length === 0) {
    return <Message id="requestQueue.none" />;
  }
  return (
    <ul className={styles['values']}>
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

function DecideForm({
  request,
  decision,
  onDone,
  onCancel,
}: {
  readonly request: RegistrationRequestRecord;
  readonly decision: Exclude<ChangeDecision, 'withdraw'>;
  readonly onDone: (outcome: RegistrationRequestRecord) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const decide = useDecideRequest();
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    decide.mutate({ requestId: request.request_id, decision, reason: values.reason }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id={`requestQueue.${decision}.title`} values={{ clientKey: request.client_key }} />
        </Panel.Title>
        <Panel.Description>
          <Message id={`requestQueue.${decision}.body`} />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {decide.isError ? <MutationError error={decide.error} /> : null}
        <div className={styles['actions']}>
          <Button
            type="submit"
            variant={decision === 'approve' ? 'primary' : 'danger'}
            disabled={decide.isPending}
            icon={<Icon name={decision === 'approve' ? 'check' : 'shield'} />}
          >
            <Message id={`requestQueue.${decision}`} />
          </Button>
          <Button variant="ghost" disabled={decide.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

function RequestCard({
  request,
  readAt,
  me,
  onDone,
}: {
  readonly request: RegistrationRequestRecord;
  readonly readAt: number;
  readonly me: string | null;
  readonly onDone: (outcome: RegistrationRequestRecord) => void;
}): ReactElement {
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null);
  const document = request.request;
  const mine = request.proposed_by === me;
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <code>{request.client_key}</code>
        </Panel.Title>
        <Panel.Description>
          <Message
            id="requestQueue.proposed"
            values={{
              proposer: request.proposed_by,
              days: Math.max(0, Math.floor((readAt - Date.parse(request.proposed_at)) / dayMs)),
            }}
          />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        <div className={styles['card']}>
          <p className={styles['quiet']}>
            <Message id="requestQueue.reason" values={{ reason: request.proposal_reason }} />
          </p>
          <dl className={styles['fields']}>
            <Field label="requestQueue.field.profile">
              <Message id={profileLabel(document.profile)} />
            </Field>
            <Field label="requestQueue.field.audienceClass">{document.audience_class}</Field>
            <Field label="requestQueue.field.application">{document.application_ref}</Field>
            <Field label="requestQueue.field.lifetimeClass">
              {document.lifetime_class ?? <Message id="requestQueue.none" />}
            </Field>
            <Field label="requestQueue.field.redirects">
              <Values values={document.redirect_uris} />
            </Field>
            <Field label="requestQueue.field.audience">
              <Values values={document.audience} />
            </Field>
            <Field label="requestQueue.field.owners">
              <Values values={request.owners} />
            </Field>
            <Field label="requestQueue.field.requested">
              <FormattedDate value={request.proposed_at} dateStyle="medium" timeStyle="short" />
            </Field>
          </dl>
          {mine ? (
            <p className={styles['quiet']}>
              <Message id="requestQueue.ownRequest" />
            </p>
          ) : (
            <div className={styles['actions']}>
              {(['approve', 'reject'] as const).map((decision) => (
                <Button
                  key={decision}
                  variant={decision === 'approve' ? 'primary' : 'secondary'}
                  size="sm"
                  aria-expanded={open === decision}
                  onClick={() => {
                    setOpen(decision);
                  }}
                >
                  <Message id={`requestQueue.${decision}`} />
                </Button>
              ))}
            </div>
          )}
          {open === null ? null : (
            <DecideForm
              key={open}
              request={request}
              decision={open}
              onDone={(outcome) => {
                setOpen(null);
                onDone(outcome);
              }}
              onCancel={() => {
                setOpen(null);
              }}
            />
          )}
        </div>
      </Panel.Body>
    </Panel.Root>
  );
}

// RequestQueue is every production registration request waiting for a provider's approval, oldest
// first (TDD-identity-experience-003 §Change Approval, ADR-IAM-003 §5.3): the document as the API
// stored it, which is what an approval registers, and the owners it names. A provider decides a
// request it did not propose; an approval links to the registration it created.
export function RequestQueue(): ReactElement {
  const queue = useRequestQueue();
  const session = useSession();
  const me = session.data?.authenticated === true ? session.data.principalId : null;
  const [done, setDone] = useState<RegistrationRequestRecord | null>(null);

  let body: ReactElement;
  if (queue.isPending) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="requestQueue.loading" />
      </p>
    );
  } else if (queue.isError) {
    body = (
      <ApiErrorPanel
        error={queue.error}
        onRetry={() => {
          void queue.refetch();
        }}
      />
    );
  } else if (queue.data.length === 0) {
    body = (
      <p className={styles['quiet']}>
        <Message id="requestQueue.empty" />
      </p>
    );
  } else {
    body = (
      <div className={styles['list']}>
        {queue.data.map((request) => (
          <RequestCard
            key={request.request_id}
            request={request}
            readAt={queue.dataUpdatedAt}
            me={me}
            onDone={setDone}
          />
        ))}
      </div>
    );
  }

  return (
    <section className={styles['list']} aria-labelledby="request-queue-title">
      <h2 id="request-queue-title" className={styles['sectionTitle']}>
        <Message id="requestQueue.title" />
      </h2>
      {done === null ? null : (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          {done.state === 'approved' && done.registration_id !== null ? (
            <Link
              to="/registrations/$registrationId"
              params={{ registrationId: done.registration_id }}
              className={styles['clientLink']}
            >
              <Message id="requestQueue.done.approved" values={{ clientKey: done.client_key }} />
            </Link>
          ) : (
            <Message id="requestQueue.done.rejected" values={{ clientKey: done.client_key }} />
          )}
        </p>
      )}
      {body}
    </section>
  );
}
