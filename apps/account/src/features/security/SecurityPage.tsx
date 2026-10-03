import { useState, type ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError, useIdempotencyKey } from '@identity-experience/app-core/api';
import { SignInRequired, useSession, useSignOut } from '@identity-experience/app-core/session';
import { Button, Icon, Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import {
  useEnroll,
  useMyAuthenticators,
  useMySessions,
  useSelfCommand,
  type MyAuthenticator,
  type Operation,
  type SelfCommandRequest,
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

// AddAuthenticator enrolls an authenticator app: the API authorizes it, and the kernel's own page
// shows the QR code and takes the first code (TDD-identity-experience-002 §Enrolling an
// authenticator app). The outcome the kernel reports is shown when the page comes back.
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
            enroll.mutate();
          }}
        >
          <Message id="security.authenticators.add" />
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
              <Table.Cell>{authenticator.label ?? ''}</Table.Cell>
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
        </>
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
