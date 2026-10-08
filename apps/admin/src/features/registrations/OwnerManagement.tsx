import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import {
  ownerRevocable,
  type Owner,
  type Registration,
} from '@identity-experience/app-core/domain/registration';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { useOwners, useStanding } from '@identity-experience/app-core/registrations';
import { Button, Icon, Panel, StatusPill, Table, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';
import { isPrincipalId } from '@/domain/principal';

import { useGrantOwner, useRevokeOwner } from './registrations-api';
import styles from './RegistrationsPage.module.scss';

function GrantForm({
  registrationId,
  onDone,
  onCancel,
}: {
  readonly registrationId: string;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const t = useMessage();
  const grant = useGrantOwner(registrationId);
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
          <Message id="owners.grant.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="owners.grant.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          {...form.register('principalId', {
            validate: (value) => isPrincipalId(value) || t('owners.grant.principal.invalid'),
          })}
          label={<Message id="owners.grant.principal" />}
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
        <div className={styles['formActions']}>
          <Button type="submit" disabled={grant.isPending} icon={<Icon name="users" />}>
            <Message id="owners.grant" />
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
  registrationId,
  owner,
  onDone,
  onCancel,
}: {
  readonly registrationId: string;
  readonly owner: Owner;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const revoke = useRevokeOwner(registrationId);
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    revoke.mutate({ principalId: owner.principal_id, reason: values.reason }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="owners.revoke.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="owners.revoke.body" />
        </Panel.Description>
      </Panel.Header>
      <p className={styles['quiet']}>
        <code>{owner.principal_id}</code>
      </p>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {revoke.isError ? <MutationError error={revoke.error} /> : null}
        <div className={styles['formActions']}>
          <Button type="submit" variant="danger" disabled={revoke.isPending} icon={<Icon name="shield" />}>
            <Message id="owners.revoke" />
          </Button>
          <Button variant="ghost" disabled={revoke.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

// OwnerManagement lists who owns a registration and lets a provider grant and revoke ownership, each
// with a reason (TDD-identity-experience-003 §Registration Ownership). It offers only what the API
// accepts: no grant on a retired registration, and no revocation that would leave a production
// registration fewer than two active owners. The Developer Console lists the same owners read-only.
export function OwnerManagement({ registration }: { readonly registration: Registration }): ReactElement {
  const owners = useOwners(registration.registration_id);
  const standing = useStanding();
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [done, setDone] = useState<'granted' | 'revoked' | null>(null);
  const grantable = registration.state !== 'retired';

  let body: ReactElement;
  if (owners.isPending || standing.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (owners.isError || standing.isError) {
    const error = owners.isError ? owners.error : standing.error;
    body = (
      <ApiErrorPanel
        error={error}
        onRetry={() => {
          void owners.refetch();
          void standing.refetch();
        }}
      />
    );
  } else {
    const current = owners.data.filter((owner) => owner.revoked_at === null);
    const environment = standing.data.environment;
    const held = current.some((owner) => !ownerRevocable(owner, owners.data, environment));
    body =
      current.length === 0 ? (
        <p className={styles['quiet']} role="status">
          <Message id="owners.manage.empty" />
        </p>
      ) : (
        <>
          {held ? (
            <p className={styles['quiet']}>
              <Message id="owners.revoke.held" />
            </p>
          ) : null}
          <Table.Root caption={<Message id="owners.manage.caption" />} captionHidden>
            <Table.Head>
              <Table.Row>
                <Table.HeaderCell>
                  <Message id="owners.column.principal" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="owners.manage.column.state" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="owners.column.granted" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="owners.column.reason" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="findings.column.action" />
                </Table.HeaderCell>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {current.map((owner) => (
                <Table.Row key={owner.ownership_id}>
                  <Table.Cell mono>{owner.principal_id}</Table.Cell>
                  <Table.Cell>
                    <StatusPill tone={owner.active ? 'success' : 'neutral'}>
                      <Message id={owner.active ? 'owners.state.active' : 'owners.state.inactive'} />
                    </StatusPill>
                  </Table.Cell>
                  <Table.Cell>
                    <FormattedDate value={owner.granted_at} dateStyle="medium" timeStyle="short" />
                  </Table.Cell>
                  <Table.Cell>{owner.grant_reason}</Table.Cell>
                  <Table.Cell>
                    {ownerRevocable(owner, owners.data, environment) ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-expanded={revoking === owner.principal_id}
                        onClick={() => {
                          setRevoking(owner.principal_id);
                          setGranting(false);
                          setDone(null);
                        }}
                      >
                        <Message id="owners.revoke.open" values={{ principal: owner.principal_id }} />
                      </Button>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </>
      );
  }

  const revokingOwner =
    revoking === null || !owners.isSuccess
      ? undefined
      : owners.data.find((owner) => owner.principal_id === revoking && owner.revoked_at === null);

  return (
    <section className={styles['section']} aria-labelledby="owner-management-title">
      <h2 id="owner-management-title" className={styles['sectionTitle']}>
        <Message id="owners.manage.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="owners.manage.description" />
      </p>
      {done === null ? null : (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id={done === 'granted' ? 'owners.done.granted' : 'owners.done.revoked'} />
        </p>
      )}
      {grantable && !granting ? (
        <div className={styles['formActions']}>
          <Button
            variant="secondary"
            size="sm"
            icon={<Icon name="users" />}
            onClick={() => {
              setGranting(true);
              setRevoking(null);
              setDone(null);
            }}
          >
            <Message id="owners.grant.open" />
          </Button>
        </div>
      ) : null}
      {granting ? (
        <GrantForm
          registrationId={registration.registration_id}
          onDone={() => {
            setGranting(false);
            setDone('granted');
          }}
          onCancel={() => {
            setGranting(false);
          }}
        />
      ) : null}
      {revokingOwner === undefined ? null : (
        <RevokeForm
          key={revokingOwner.ownership_id}
          registrationId={registration.registration_id}
          owner={revokingOwner}
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
