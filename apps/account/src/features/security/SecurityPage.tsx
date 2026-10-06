import { useState, type ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError, useIdempotencyKey } from '@identity-experience/app-core/api';
import { SignInRequired, useSession, useSignOut } from '@identity-experience/app-core/session';
import { Button, Icon, Panel, StatusPill, Table, TextField } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';

import {
  useAddressCommand,
  useEnroll,
  useMyAddresses,
  useMyAuthenticators,
  useMySessions,
  useSelfCommand,
  type MyAuthenticator,
  type Operation,
  type SelfCommandRequest,
  usedRecoveryCodes,
} from './security-api';
import styles from './SecurityPage.module.scss';

// Outcome states what one of the person's own commands came to.
function Outcome({
  done,
  operation,
}: {
  readonly done: 'terminate' | 'remove';
  readonly operation: Operation;
}): ReactElement {
  switch (operation.state) {
    case 'applied':
      return (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message
            id={done === 'terminate' ? 'security.sessions.ended' : 'security.authenticators.removed'}
          />
        </p>
      );
    case 'refused':
      return (
        <p className={styles['quiet']} role="alert">
          <Message
            id={
              operation.result_code === 'last_authenticator'
                ? 'security.authenticators.last'
                : operation.result_code === 'assurance_floor'
                  ? 'security.authenticators.floor'
                  : 'security.refused'
            }
            values={{ code: operation.result_code ?? '' }}
          />
        </p>
      );
    case 'unresolved':
      return (
        <p className={styles['quiet']} role="alert">
          <Message id="security.unresolved" values={{ id: operation.operation_id }} />
        </p>
      );
    default:
      return (
        <p className={styles['quiet']} role="status">
          <Message id="security.running" />
        </p>
      );
  }
}

function useCommand() {
  const mutation = useSelfCommand();
  const keyFor = useIdempotencyKey();
  const send = (command: SelfCommandRequest, onDone: (operation: Operation) => void) => {
    mutation.mutate({ ...command, idempotencyKey: keyFor(command) }, { onSuccess: onDone });
  };
  return { mutation, send };
}

// EndEverywhere ends every session, this browser's included, after an explicit confirmation
// (TDD-identity-experience-002 §Terminating the Current Session). Its Keycloak session is gone
// afterwards, so this browser's BFF session is ended too.
function EndEverywhere(): ReactElement {
  const [confirming, setConfirming] = useState(false);
  const { mutation, send } = useCommand();
  const signOut = useSignOut();
  const session = useSession();
  const csrfToken = session.data?.authenticated === true ? session.data.csrfToken : '';
  const [outcome, setOutcome] = useState<Operation | null>(null);
  if (!confirming) {
    return (
      <div className={styles['actions']}>
        <Button
          variant="danger"
          icon={<Icon name="shield" />}
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Message id="security.sessions.endAll" />
        </Button>
      </div>
    );
  }
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="security.sessions.endAll.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="security.sessions.endAll.body" />
        </Panel.Description>
      </Panel.Header>
      <div className={styles['confirm']}>
        {mutation.isError ? <MutationError error={mutation.error} /> : null}
        {outcome === null || outcome.state === 'applied' ? null : (
          <Outcome done="terminate" operation={outcome} />
        )}
        <div className={styles['actions']}>
          <Button
            variant="danger"
            disabled={mutation.isPending || signOut.isPending}
            onClick={() => {
              send({ action: 'terminate-all' }, (operation) => {
                setOutcome(operation);
                if (operation.state === 'applied') {
                  signOut.mutate(csrfToken);
                }
              });
            }}
          >
            <Message id="security.sessions.endAll.confirm" />
          </Button>
          <Button
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => {
              setConfirming(false);
            }}
          >
            <Message id="form.cancel" />
          </Button>
        </div>
      </div>
    </Panel.Root>
  );
}

function Sessions(): ReactElement {
  const sessions = useMySessions();
  const { mutation, send } = useCommand();
  const [outcome, setOutcome] = useState<Operation | null>(null);
  let body: ReactElement;
  if (sessions.isPending) {
    body = <div aria-busy="true" />;
  } else if (sessions.isError) {
    body = <ApiErrorPanel error={sessions.error} onRetry={() => void sessions.refetch()} />;
  } else {
    body = (
      <Table.Root caption={<Message id="security.sessions.title" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="security.sessions.started" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="security.sessions.lastAccess" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="security.sessions.clients" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="security.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {sessions.data.map((session) => (
            <Table.Row key={session.security_ref}>
              <Table.Cell>
                <FormattedDate value={session.started} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell>
                <FormattedDate value={session.last_access} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell mono>{(session.clients ?? []).join(', ')}</Table.Cell>
              <Table.Cell>
                {session.current ? (
                  <StatusPill tone="info">
                    <Message id="security.sessions.current" />
                  </StatusPill>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => {
                      setOutcome(null);
                      send({ action: 'terminate', securityRef: session.security_ref }, setOutcome);
                    }}
                  >
                    <Message id="security.sessions.end" />
                  </Button>
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="security.sessions.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="security.sessions.description" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        {body}
        {mutation.isError ? <MutationError error={mutation.error} /> : null}
        {outcome === null ? null : <Outcome done="terminate" operation={outcome} />}
        <EndEverywhere />
      </Panel.Body>
    </Panel.Root>
  );
}

function RemoveForm({
  authenticator,
  onDone,
  onCancel,
}: {
  readonly authenticator: MyAuthenticator;
  readonly onDone: (operation: Operation) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const { mutation, send } = useCommand();
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="security.authenticators.remove.title" values={{ type: authenticator.type }} />
        </Panel.Title>
        <Panel.Description>
          <Message id="security.authenticators.remove.body" />
        </Panel.Description>
      </Panel.Header>
      <div className={styles['confirm']}>
        {mutation.isError ? <MutationError error={mutation.error} /> : null}
        <div className={styles['actions']}>
          <Button
            variant="danger"
            disabled={mutation.isPending}
            onClick={() => {
              send({ action: 'remove', securityRef: authenticator.security_ref }, onDone);
            }}
          >
            <Message id="security.authenticators.remove" />
          </Button>
          <Button variant="ghost" disabled={mutation.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </div>
    </Panel.Root>
  );
}

// AddAuthenticator enrolls an authenticator app or a security key: the API authorizes it, and the
// kernel's own page enrolls it (TDD-identity-experience-002 §Enrolling an authenticator app,
// §Adding a security key). The outcome the kernel reports is shown when the page comes back; it
// does not say which was added.
function AddAuthenticator(): ReactElement {
  const enroll = useEnroll();
  const outcome = new URLSearchParams(window.location.search).get('kc_action_status');
  return (
    <div className={styles['confirm']}>
      {outcome === 'success' ? (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id="security.authenticators.enrolled" />
        </p>
      ) : outcome === 'cancelled' ? (
        <p className={styles['quiet']} role="status">
          <Message id="security.authenticators.enrollCancelled" />
        </p>
      ) : null}
      {enroll.isError ? <MutationError error={enroll.error} /> : null}
      <div className={styles['actions']}>
        <Button
          variant="secondary"
          icon={<Icon name="key" />}
          disabled={enroll.isPending}
          onClick={() => {
            enroll.mutate('totp');
          }}
        >
          <Message id="security.authenticators.add" />
        </Button>
        <Button
          variant="secondary"
          icon={<Icon name="shield" />}
          disabled={enroll.isPending}
          onClick={() => {
            enroll.mutate('webauthn');
          }}
        >
          <Message id="security.authenticators.addKey" />
        </Button>
        <Button
          variant="secondary"
          icon={<Icon name="grid" />}
          disabled={enroll.isPending}
          onClick={() => {
            enroll.mutate('recovery-codes');
          }}
        >
          <Message id="security.authenticators.addCodes" />
        </Button>
      </div>
    </div>
  );
}

// Authenticators offers removal on every row: the last-authenticator refusal is the API's, rendered
// here, never computed (TDD-identity-experience-002 §The Last Authenticator Guard).
function Authenticators(): ReactElement {
  const authenticators = useMyAuthenticators();
  const [removing, setRemoving] = useState<MyAuthenticator | null>(null);
  const [outcome, setOutcome] = useState<Operation | null>(null);
  let body: ReactElement;
  if (authenticators.isPending) {
    body = <div aria-busy="true" />;
  } else if (authenticators.isError) {
    body = <ApiErrorPanel error={authenticators.error} onRetry={() => void authenticators.refetch()} />;
  } else if (authenticators.data.length === 0) {
    body = (
      <p className={styles['quiet']}>
        <Message id="security.authenticators.none" />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id="security.authenticators.title" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="security.authenticators.type" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="security.authenticators.label" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="security.authenticators.created" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="security.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {authenticators.data.map((authenticator) => (
            <Table.Row key={authenticator.security_ref}>
              <Table.Cell mono>{authenticator.type}</Table.Cell>
              <Table.Cell>
                {authenticator.label ?? ''}
                {authenticator.remaining_codes === undefined ||
                authenticator.total_codes === undefined ? null : (
                  <>
                    {authenticator.label === undefined ? '' : ' · '}
                    <Message
                      id="security.authenticators.codesLeft"
                      values={{ remaining: authenticator.remaining_codes, total: authenticator.total_codes }}
                    />
                  </>
                )}
              </Table.Cell>
              <Table.Cell>
                <FormattedDate value={authenticator.created} dateStyle="medium" />
              </Table.Cell>
              <Table.Cell>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-expanded={removing === authenticator}
                  onClick={() => {
                    setRemoving(authenticator);
                    setOutcome(null);
                  }}
                >
                  <Message id="security.authenticators.remove" />
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="security.authenticators.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="security.authenticators.description" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        {authenticators.data?.some(usedRecoveryCodes) === true ? (
          <p className={styles['quiet']} role="status">
            <Message id="security.authenticators.codesUsed" />
          </p>
        ) : null}
        {body}
        {removing === null ? null : (
          <RemoveForm
            authenticator={removing}
            onDone={(operation) => {
              setRemoving(null);
              setOutcome(operation);
            }}
            onCancel={() => {
              setRemoving(null);
            }}
          />
        )}
        {outcome === null ? null : <Outcome done="remove" operation={outcome} />}
        <AddAuthenticator />
      </Panel.Body>
    </Panel.Root>
  );
}

// NotificationAddresses is where a person is told when their account changes (ADR-IAM-007 §5.2,
// TDD-identity-experience-002 1.6.0). Adding and removing ask for a recent sign-in, which the API
// asks for itself; an added address is pending until the code sent to it is entered here.
function NotificationAddresses(): ReactElement {
  const addresses = useMyAddresses();
  const command = useAddressCommand();
  const idempotencyKey = useIdempotencyKey();
  const [address, setAddress] = useState('');
  const [codes, setCodes] = useState<Readonly<Record<string, string>>>({});
  const [done, setDone] = useState<MessageKey | null>(null);
  const run = (request: Parameters<typeof command.mutate>[0], outcome: MessageKey, after?: () => void) => {
    setDone(null);
    command.mutate(request, {
      onSuccess: () => {
        setDone(outcome);
        after?.();
      },
    });
  };
  let body: ReactElement;
  if (addresses.isPending) {
    body = <div aria-busy="true" />;
  } else if (addresses.isError) {
    body = <ApiErrorPanel error={addresses.error} onRetry={() => void addresses.refetch()} />;
  } else {
    body = (
      <Table.Root caption={<Message id="security.addresses.title" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="security.addresses.address" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="security.addresses.state" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="security.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {addresses.data.map((held) => (
            <Table.Row key={held.address_id}>
              <Table.Cell mono>{held.address}</Table.Cell>
              <Table.Cell>
                {held.state === 'active' ? (
                  <StatusPill tone="success">
                    <Message id="security.addresses.active" />
                  </StatusPill>
                ) : (
                  <StatusPill tone="warning">
                    <Message id="security.addresses.pending" />
                  </StatusPill>
                )}
              </Table.Cell>
              <Table.Cell>
                <div className={styles['actions']}>
                  {held.state === 'pending' ? (
                    <form
                      className={styles['inline']}
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(
                          {
                            action: 'verify',
                            addressId: held.address_id,
                            code: codes[held.address_id] ?? '',
                          },
                          'security.addresses.proven',
                        );
                      }}
                    >
                      <TextField
                        label={<Message id="security.addresses.code" />}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={codes[held.address_id] ?? ''}
                        onChange={(event) => {
                          setCodes({ ...codes, [held.address_id]: event.target.value });
                        }}
                      />
                      <Button type="submit" size="sm" disabled={command.isPending}>
                        <Message id="security.addresses.verify" />
                      </Button>
                    </form>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={command.isPending}
                    onClick={() => {
                      run({ action: 'remove', addressId: held.address_id }, 'security.addresses.removed');
                    }}
                  >
                    <Message id="security.addresses.remove" />
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="security.addresses.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="security.addresses.description" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        {body}
        {addresses.data !== undefined &&
        addresses.data.filter((held) => held.state === 'active').length < 2 ? (
          <p className={styles['quiet']} role="status">
            <Message id="security.addresses.addSecond" />
          </p>
        ) : null}
        <form
          className={styles['inline']}
          onSubmit={(event) => {
            event.preventDefault();
            const request = { action: 'add' as const, address: address.trim() };
            run({ ...request, idempotencyKey: idempotencyKey(request) }, 'security.addresses.sent', () => {
              setAddress('');
            });
          }}
        >
          <TextField
            label={<Message id="security.addresses.new" />}
            type="email"
            autoComplete="email"
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
            }}
          />
          <Button type="submit" disabled={command.isPending || address.trim() === ''}>
            <Message id="security.addresses.add" />
          </Button>
        </form>
        {command.isError ? <MutationError error={command.error} /> : null}
        {done === null ? null : (
          <p className={styles['success']} role="status">
            <Icon name="check" />
            <Message id={done} />
          </p>
        )}
      </Panel.Body>
    </Panel.Root>
  );
}

// SecurityPage is a person's own account security (TDD-identity-experience-002 §As Built): their
// sessions and their authenticators. Consents, enrollment and recovery are not offered yet.
export function SecurityPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Message id="security.eyebrow" />
        </p>
        <h1 className={styles['title']}>
          <Message id="security.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="security.lead" />
        </p>
      </header>
      {session.data?.authenticated === true ? (
        <>
          <Sessions />
          <Authenticators />
          <NotificationAddresses />
        </>
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
