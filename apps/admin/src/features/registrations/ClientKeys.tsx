import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import {
  Button,
  Icon,
  Panel,
  StatusPill,
  Table,
  TextAreaField,
  type StatusTone,
} from '@identity-experience/ui';

import { ApiErrorPanel } from '@/core/api/ApiErrorPanel';
import { MutationError } from '@/core/api/MutationError';
import { ReasonField, reasonRules } from '@/core/forms/ReasonField';
import { Message, useMessage } from '@/core/i18n/Message';
import { readPublicKey } from '@/domain/public-key';
import {
  hoursLeft,
  keyed,
  lastAccepted,
  rotationOffered,
  type ClientKey,
  type KeyState,
  type Registration,
} from '@/domain/registration';

import { useKeys, useRevokeKey, useRotateKey } from './registrations-api';
import styles from './RegistrationsPage.module.scss';

const tones: Readonly<Record<KeyState, StatusTone>> = {
  active: 'success',
  retiring: 'warning',
  revoked: 'neutral',
};

// The key's state and what it means now: a retiring key's overlap left, a revoked key's reason. Times
// are read against when the list was read, so every row uses the same clock.
function KeyStatus({
  clientKey,
  readAt,
}: {
  readonly clientKey: ClientKey;
  readonly readAt: number;
}): ReactElement {
  return (
    <span className={styles['stack']}>
      <StatusPill tone={tones[clientKey.state]}>
        <Message id={`keys.state.${clientKey.state}`} />
      </StatusPill>
      {clientKey.state === 'retiring' && clientKey.retiring_at !== null ? (
        <span className={styles['quiet']}>
          <Message id="keys.retiringLeft" values={{ hours: hoursLeft(clientKey.retiring_at, readAt) }} />
        </span>
      ) : null}
      {clientKey.state === 'revoked' && clientKey.revocation_reason !== undefined ? (
        <span className={styles['quiet']}>{clientKey.revocation_reason}</span>
      ) : null}
    </span>
  );
}

// RotateForm takes the next public key. The console never generates a key pair: the team generates it
// where the private key will live and pastes the public half, which is checked here before anything is
// sent (TDD-identity-experience-004 §The Public Key, Never the Private One).
function RotateForm({
  registration,
  previous,
  onDone,
  onCancel,
}: {
  readonly registration: Registration;
  readonly previous: readonly string[];
  readonly onDone: (outcome: 'rotated' | 'unchanged') => void;
  readonly onCancel: () => void;
}): ReactElement {
  const t = useMessage();
  const rotate = useRotateKey(registration.registration_id);
  const form = useForm<{ publicKey: string }>({ defaultValues: { publicKey: '' } });
  const submit = form.handleSubmit((values) => {
    const read = readPublicKey(values.publicKey);
    if (!('key' in read)) {
      return;
    }
    rotate.mutate(read.key, {
      onSuccess: (answer) => {
        // 201 and 200 both return the keys. An active key the list already held is a rotation that
        // already happened, which a retry after a lost answer meets.
        const active = answer.keys.find((key) => key.state === 'active');
        onDone(active !== undefined && !previous.includes(active.key_id) ? 'rotated' : 'unchanged');
      },
    });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="keys.rotate.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="keys.rotate.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextAreaField
          {...form.register('publicKey', {
            validate: (value) => {
              const read = readPublicKey(value);
              return 'key' in read || t(`workloads.key.${read.problem}`);
            },
          })}
          label={<Message id="keys.rotate.field" />}
          hint={<Message id="workloads.create.publicKey.hint" />}
          error={form.formState.errors.publicKey?.message}
          spellCheck={false}
          required
        />
        {rotate.isError ? <MutationError error={rotate.error} /> : null}
        <div className={styles['formActions']}>
          <Button type="submit" disabled={rotate.isPending} icon={<Icon name="shield" />}>
            <Message id="keys.rotate" />
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={rotate.isPending}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

function RevokeForm({
  registration,
  clientKey,
  last,
  onDone,
  onCancel,
}: {
  readonly registration: Registration;
  readonly clientKey: ClientKey;
  readonly last: boolean;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const revoke = useRevokeKey(registration.registration_id);
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    revoke.mutate({ keyId: clientKey.key_id, reason: values.reason }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="keys.revoke.title" values={{ kid: clientKey.kid }} />
        </Panel.Title>
        <Panel.Description>
          <Message id={last ? 'keys.revoke.last' : 'keys.revoke.body'} />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {revoke.isError ? <MutationError error={revoke.error} /> : null}
        <div className={styles['formActions']}>
          <Button type="submit" variant="danger" disabled={revoke.isPending} icon={<Icon name="shield" />}>
            <Message id="keys.revoke" />
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={revoke.isPending}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

// ClientKeys lists a keyed registration's keys and offers rotation and revocation on behalf of the
// team that holds the private key (TDD-identity-experience-003 §Registration Drift Oversight). It is
// the operator's path while the Developer Console has no authority model of its own.
export function ClientKeys({ registration }: { readonly registration: Registration }): ReactElement | null {
  const isKeyed = keyed(registration);
  const keys = useKeys(registration.registration_id, isKeyed);
  const [rotating, setRotating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [notice, setNotice] = useState<'rotated' | 'unchanged' | 'revoked' | null>(null);
  if (!isKeyed) {
    return null;
  }

  let body: ReactElement;
  if (keys.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (keys.isError) {
    body = (
      <ApiErrorPanel
        error={keys.error}
        onRetry={() => {
          void keys.refetch();
        }}
      />
    );
  } else {
    const list = keys.data.keys;
    const selected = list.find((key) => key.key_id === revoking && key.state !== 'revoked');
    body = (
      <>
        {list.length === 0 ? (
          <p className={styles['quiet']} role="status">
            <Message id="keys.empty" />
          </p>
        ) : (
          <Table.Root caption={<Message id="keys.caption" />} captionHidden>
            <Table.Head>
              <Table.Row>
                <Table.HeaderCell>
                  <Message id="keys.column.kid" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="keys.column.state" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="keys.column.thumbprint" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="keys.column.registered" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="keys.column.expires" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="findings.column.action" />
                </Table.HeaderCell>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {list.map((clientKey) => (
                <Table.Row key={clientKey.key_id}>
                  <Table.Cell mono>{clientKey.kid}</Table.Cell>
                  <Table.Cell>
                    <KeyStatus clientKey={clientKey} readAt={keys.dataUpdatedAt} />
                  </Table.Cell>
                  <Table.Cell mono>
                    <code className={styles['diff']} title={clientKey.thumbprint}>
                      {clientKey.thumbprint}
                    </code>
                  </Table.Cell>
                  <Table.Cell>
                    <FormattedDate value={clientKey.registered_at} dateStyle="medium" timeStyle="short" />
                  </Table.Cell>
                  <Table.Cell>
                    <FormattedDate value={clientKey.expires_at} dateStyle="medium" timeStyle="short" />
                  </Table.Cell>
                  <Table.Cell>
                    {clientKey.state === 'revoked' ? null : (
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-expanded={revoking === clientKey.key_id}
                        onClick={() => {
                          setRevoking(clientKey.key_id);
                          setRotating(false);
                          setNotice(null);
                        }}
                      >
                        <Message id="keys.revoke.open" values={{ kid: clientKey.kid }} />
                      </Button>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
        {rotationOffered(registration, list) && !rotating ? (
          <div className={styles['formActions']}>
            <Button
              variant="secondary"
              icon={<Icon name="shield" />}
              aria-expanded={false}
              onClick={() => {
                setRotating(true);
                setRevoking(null);
                setNotice(null);
              }}
            >
              <Message id="keys.rotate.open" />
            </Button>
          </div>
        ) : null}
        {rotating ? (
          <RotateForm
            registration={registration}
            previous={list.map((key) => key.key_id)}
            onDone={(outcome) => {
              setRotating(false);
              setNotice(outcome);
            }}
            onCancel={() => {
              setRotating(false);
            }}
          />
        ) : null}
        {selected === undefined ? null : (
          <RevokeForm
            key={selected.key_id}
            registration={registration}
            clientKey={selected}
            last={lastAccepted(list, selected.key_id)}
            onDone={() => {
              setRevoking(null);
              setNotice('revoked');
            }}
            onCancel={() => {
              setRevoking(null);
            }}
          />
        )}
      </>
    );
  }

  return (
    <section className={styles['section']} aria-labelledby="keys-title">
      <h2 id="keys-title" className={styles['sectionTitle']}>
        <Message id="keys.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="keys.description" />
      </p>
      {notice === null ? null : (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id={`keys.done.${notice}`} />
        </p>
      )}
      {body}
    </section>
  );
}
