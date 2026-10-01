import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { Button, Icon, Panel, StatusPill, Table, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';

import { useApplicationDevelopers, useGrantDeveloper, useRevokeDeveloper } from './principals-api';
import styles from './PrincipalsPage.module.scss';

const principalPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function GrantForm({
  onDone,
  onCancel,
}: {
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const t = useMessage();
  const grant = useGrantDeveloper();
  const form = useForm<{ principalId: string; reason: string }>({
    defaultValues: { principalId: '', reason: '' },
  });
  const submit = form.handleSubmit((values) => {
    grant.mutate(values, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="developers.grant.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="developers.grant.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          {...form.register('principalId', {
            validate: (value) =>
              principalPattern.test(value.trim()) || t('developers.grant.principal.invalid'),
          })}
          label={<Message id="developers.grant.principal" />}
          error={form.formState.errors.principalId?.message}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {grant.isError ? <MutationError error={grant.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" disabled={grant.isPending} icon={<Icon name="key" />}>
            <Message id="developers.grant" />
          </Button>
          <Button variant="ghost" disabled={grant.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

function RevokeForm({
  principalId,
  onDone,
  onCancel,
}: {
  readonly principalId: string;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const revoke = useRevokeDeveloper();
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    revoke.mutate({ principalId, reason: values.reason }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="developers.revoke.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="developers.revoke.body" />
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
        {revoke.isError ? <MutationError error={revoke.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" variant="danger" disabled={revoke.isPending} icon={<Icon name="shield" />}>
            <Message id="developers.revoke" />
          </Button>
          <Button variant="ghost" disabled={revoke.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

// ApplicationDevelopers lists who may create non-production registrations without provider authority
// (ADR-IAM-003 §5.3, TDD-identity-experience-003 §Application Developers), and lets a provider grant
// and revoke that standing, each with a reason.
export function ApplicationDevelopers(): ReactElement {
  const developers = useApplicationDevelopers();
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [done, setDone] = useState<'granted' | 'revoked' | null>(null);

  let body: ReactElement;
  if (developers.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (developers.isError) {
    body = (
      <ApiErrorPanel
        error={developers.error}
        onRetry={() => {
          void developers.refetch();
        }}
      />
    );
  } else if (developers.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="developers.empty" />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id="developers.caption" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="developers.column.principal" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="developers.column.state" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="developers.column.reason" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="developers.column.granted" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="findings.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {developers.data.map((grant) => (
            <Table.Row key={grant.grant_id}>
              <Table.Cell mono>{grant.principal_id}</Table.Cell>
              <Table.Cell>
                <StatusPill tone={grant.active ? 'success' : 'neutral'}>
                  <Message id={grant.active ? 'developers.state.active' : 'developers.state.inactive'} />
                </StatusPill>
              </Table.Cell>
              <Table.Cell>{grant.revoke_reason ?? grant.grant_reason}</Table.Cell>
              <Table.Cell>
                <FormattedDate value={grant.granted_at} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell>
                {grant.revoked_at === null ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-expanded={revoking === grant.principal_id}
                    onClick={() => {
                      setRevoking(grant.principal_id);
                      setGranting(false);
                      setDone(null);
                    }}
                  >
                    <Message id="developers.revoke.open" values={{ principal: grant.principal_id }} />
                  </Button>
                ) : null}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }

  return (
    <section className={styles['section']} aria-labelledby="developers-title">
      <h2 id="developers-title" className={styles['sectionTitle']}>
        <Message id="developers.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="developers.description" />
      </p>
      {done === null ? null : (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id={done === 'granted' ? 'developers.done.granted' : 'developers.done.revoked'} />
        </p>
      )}
      {granting ? null : (
        <div className={styles['actions']}>
          <Button
            variant="secondary"
            icon={<Icon name="key" />}
            onClick={() => {
              setGranting(true);
              setRevoking(null);
              setDone(null);
            }}
          >
            <Message id="developers.grant.open" />
          </Button>
        </div>
      )}
      {granting ? (
        <GrantForm
          onDone={() => {
            setGranting(false);
            setDone('granted');
          }}
          onCancel={() => {
            setGranting(false);
          }}
        />
      ) : null}
      {revoking === null ? null : (
        <RevokeForm
          key={revoking}
          principalId={revoking}
          onDone={() => {
            setRevoking(null);
            setDone('revoked');
          }}
          onCancel={() => {
            setRevoking(null);
          }}
        />
      )}
      {body}
    </section>
  );
}
