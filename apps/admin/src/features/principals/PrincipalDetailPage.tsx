import { Link } from '@tanstack/react-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError, useIdempotencyKey } from '@identity-experience/app-core/api';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Button, Icon, Panel, StatusPill, Table, type StatusTone } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import {
  canRevoke,
  containmentActions,
  firstFactorsAfter,
  isNotifiedEvent,
  revocable,
  type Authenticator,
  type ContainmentAction,
  type NotificationAddress,
  type NotificationState,
  type PrincipalDetail,
  type SecurityOperation,
} from '@/domain/security';

import { stateTones } from './labels';
import styles from './PrincipalsPage.module.scss';
import {
  useKernelEventSweep,
  usePrincipalDetail,
  useSecurityCommand,
  useSecuritySection,
} from './security-api';

type Command = ContainmentAction | 'revoke';

const commandCopy: Readonly<Record<Command, { readonly title: MessageKey; readonly body: MessageKey }>> = {
  suspend: { title: 'principals.contain.suspend.title', body: 'principals.contain.suspend.body' },
  restore: { title: 'principals.contain.restore.title', body: 'principals.contain.restore.body' },
  'terminate-all': { title: 'principals.contain.terminate.title', body: 'principals.contain.terminate.body' },
  revoke: { title: 'principals.contain.revoke.title', body: 'principals.contain.revoke.body' },
};

const actionLabel: Readonly<Record<ContainmentAction, MessageKey>> = {
  suspend: 'lifecycle.suspend',
  restore: 'lifecycle.restore',
  'terminate-all': 'principals.contain.terminate',
};

// Outcome states what a command came to (TDD-identity-experience-003 §Principal Search and Security
// State): applied, refused with its result, parked for an operator, or still running.
function Outcome({
  command,
  operation,
}: {
  readonly command: Command;
  readonly operation: SecurityOperation;
}): ReactElement {
  switch (operation.state) {
    case 'applied':
      return (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id={`principals.contain.done.${command}`} />
        </p>
      );
    case 'refused':
      return (
        <p className={styles['quiet']} role="alert">
          <Message
            id={
              operation.result_code === 'last_authenticator'
                ? 'principals.contain.refused.lastAuthenticator'
                : operation.result_code === 'assurance_floor'
                  ? 'principals.contain.refused.floor'
                  : 'principals.contain.refused.other'
            }
            values={{ code: operation.result_code ?? '' }}
          />
        </p>
      );
    case 'unresolved':
      return (
        <p className={styles['quiet']} role="alert">
          <Message id="principals.contain.unresolved" values={{ id: operation.operation_id }} />
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

function CommandForm({
  principal,
  command,
  authenticator,
  remaining,
  onDone,
  onCancel,
}: {
  readonly principal: PrincipalDetail;
  readonly command: Command;
  readonly authenticator?: Authenticator;
  readonly remaining?: number;
  readonly onDone: (operation: SecurityOperation) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const mutation = useSecurityCommand();
  const keyFor = useIdempotencyKey();
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    const request = {
      principalId: principal.principal_id,
      action: command,
      ...(authenticator?.security_ref === undefined ? {} : { securityRef: authenticator.security_ref }),
      expectedVersion: principal.security_version,
      reason: values.reason,
    };
    mutation.mutate({ ...request, idempotencyKey: keyFor(request) }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id={commandCopy[command].title} values={{ type: authenticator?.type ?? '' }} />
        </Panel.Title>
        <Panel.Description>
          <Message id={commandCopy[command].body} />
        </Panel.Description>
      </Panel.Header>
      {remaining === undefined ? null : (
        <p className={styles['quiet']}>
          <Message id="principals.contain.revoke.remaining" values={{ count: remaining }} />
        </p>
      )}
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {mutation.isError ? <MutationError error={mutation.error} /> : null}
        <div className={styles['actions']}>
          <Button
            type="submit"
            variant={command === 'restore' ? 'primary' : 'danger'}
            disabled={mutation.isPending}
            icon={<Icon name={command === 'restore' ? 'check' : 'shield'} />}
          >
            {command === 'revoke' ? (
              <Message id="principals.contain.revoke" />
            ) : (
              <Message id={actionLabel[command]} />
            )}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={mutation.isPending}>
            <Message id="form.cancel" />
          </Button>
        </div>
        {mutation.isPending ? (
          <p className={styles['quiet']} role="status">
            <Message id="principals.contain.sending" />
          </p>
        ) : null}
      </form>
    </Panel.Root>
  );
}

// Section is one privileged read, made only when the operator opens it (TDD-identity-experience-003
// §Reads Are Privileged Too).
function Section({
  title,
  open,
  onOpen,
  children,
}: {
  readonly title: MessageKey;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id={title} />
        </Panel.Title>
      </Panel.Header>
      <Panel.Body>
        {open ? (
          children
        ) : (
          <Button variant="secondary" size="sm" onClick={onOpen} icon={<Icon name="arrow" />}>
            <Message id="principals.section.open" />
          </Button>
        )}
      </Panel.Body>
    </Panel.Root>
  );
}

function SessionsSection({ principalId }: { readonly principalId: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const sessions = useSecuritySection(principalId, 'sessions', open);
  return (
    <Section
      title="principals.sessions.title"
      open={open}
      onOpen={() => {
        setOpen(true);
      }}
    >
      {sessions.isPending ? (
        <div aria-busy="true" />
      ) : sessions.isError ? (
        <ApiErrorPanel error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : sessions.data.length === 0 ? (
        <p className={styles['quiet']}>
          <Message id="principals.sessions.none" />
        </p>
      ) : (
        <Table.Root caption={<Message id="principals.sessions.title" />} captionHidden>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>
                <Message id="principals.sessions.started" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.sessions.lastAccess" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.sessions.clients" />
              </Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {sessions.data.map((session) => (
              <Table.Row key={`${session.started}-${session.last_access}`}>
                <Table.Cell>
                  <FormattedDate value={session.started} dateStyle="medium" timeStyle="short" />
                </Table.Cell>
                <Table.Cell>
                  <FormattedDate value={session.last_access} dateStyle="medium" timeStyle="short" />
                </Table.Cell>
                <Table.Cell mono>{(session.clients ?? []).join(', ')}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Section>
  );
}

function AuthenticatorsSection({
  principal,
  operator,
}: {
  readonly principal: PrincipalDetail;
  readonly operator: string | null;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState<Authenticator | null>(null);
  const [outcome, setOutcome] = useState<SecurityOperation | null>(null);
  const authenticators = useSecuritySection(principal.principal_id, 'authenticators', open);
  const offer = canRevoke(principal, operator);
  return (
    <Section
      title="principals.authenticators.title"
      open={open}
      onOpen={() => {
        setOpen(true);
      }}
    >
      {authenticators.isPending ? (
        <div aria-busy="true" />
      ) : authenticators.isError ? (
        <ApiErrorPanel error={authenticators.error} onRetry={() => void authenticators.refetch()} />
      ) : authenticators.data.length === 0 ? (
        <p className={styles['quiet']}>
          <Message id="principals.authenticators.none" />
        </p>
      ) : (
        <>
          <Table.Root caption={<Message id="principals.authenticators.title" />} captionHidden>
            <Table.Head>
              <Table.Row>
                <Table.HeaderCell>
                  <Message id="principals.authenticators.type" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="principals.authenticators.label" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="principals.authenticators.created" />
                </Table.HeaderCell>
                {offer ? (
                  <Table.HeaderCell>
                    <Message id="principals.authenticators.action" />
                  </Table.HeaderCell>
                ) : null}
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {authenticators.data.map((authenticator) => (
                <Table.Row
                  key={authenticator.security_ref ?? `${authenticator.type}-${authenticator.created}`}
                >
                  <Table.Cell mono>{authenticator.type}</Table.Cell>
                  <Table.Cell>{authenticator.label ?? ''}</Table.Cell>
                  <Table.Cell>
                    <FormattedDate value={authenticator.created} dateStyle="medium" />
                  </Table.Cell>
                  {offer ? (
                    <Table.Cell>
                      {revocable(authenticators.data, authenticator) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-expanded={revoking === authenticator}
                          onClick={() => {
                            setRevoking(authenticator);
                            setOutcome(null);
                          }}
                        >
                          <Message id="principals.contain.revoke" />
                        </Button>
                      ) : (
                        <span className={styles['quiet']}>
                          <Message id="principals.authenticators.lastFirstFactor" />
                        </span>
                      )}
                    </Table.Cell>
                  ) : null}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
          {revoking === null ? null : (
            <CommandForm
              principal={principal}
              command="revoke"
              authenticator={revoking}
              remaining={firstFactorsAfter(authenticators.data, revoking)}
              onDone={(operation) => {
                setRevoking(null);
                setOutcome(operation);
                void authenticators.refetch();
              }}
              onCancel={() => {
                setRevoking(null);
              }}
            />
          )}
          {outcome === null ? null : <Outcome command="revoke" operation={outcome} />}
        </>
      )}
    </Section>
  );
}

const addressTones: Readonly<Record<NotificationAddress['state'], StatusTone>> = {
  active: 'success',
  pending: 'warning',
  removed: 'neutral',
};

// Where the Principal is told that their account changed (TDD-identity-control-008): each address
// it holds or held, read only when opened. Assisted recovery starts here: a person with no active
// address cannot be told, and the account application asks them for one.
function NotificationAddressesSection({ principalId }: { readonly principalId: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const addresses = useSecuritySection(principalId, 'notification-addresses', open);
  return (
    <Section
      title="principals.addresses.title"
      open={open}
      onOpen={() => {
        setOpen(true);
      }}
    >
      {addresses.isPending ? (
        <div aria-busy="true" />
      ) : addresses.isError ? (
        <ApiErrorPanel error={addresses.error} onRetry={() => void addresses.refetch()} />
      ) : addresses.data.length === 0 ? (
        <p className={styles['quiet']}>
          <Message id="principals.addresses.none" />
        </p>
      ) : (
        <>
          {addresses.data.some((address) => address.state === 'active') ? null : (
            <p className={styles['quiet']} role="status">
              <Message id="principals.addresses.noneActive" />
            </p>
          )}
          <Table.Root caption={<Message id="principals.addresses.title" />} captionHidden>
            <Table.Head>
              <Table.Row>
                <Table.HeaderCell>
                  <Message id="principals.addresses.address" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="principals.addresses.state" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="principals.addresses.origin" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="principals.addresses.added" />
                </Table.HeaderCell>
                <Table.HeaderCell>
                  <Message id="principals.addresses.changed" />
                </Table.HeaderCell>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {addresses.data.map((address) => (
                <Table.Row key={address.address_id}>
                  <Table.Cell>{address.address}</Table.Cell>
                  <Table.Cell>
                    <StatusPill tone={addressTones[address.state]}>
                      <Message id={`principals.addresses.state.${address.state}`} />
                    </StatusPill>
                  </Table.Cell>
                  <Table.Cell>
                    <Message id={`principals.addresses.origin.${address.origin}`} />
                  </Table.Cell>
                  <Table.Cell>
                    <FormattedDate value={address.added_at} dateStyle="medium" timeStyle="short" />
                  </Table.Cell>
                  <Table.Cell>
                    {address.removed_at !== undefined ? (
                      <>
                        <Message id="principals.addresses.removedAt" />{' '}
                        <FormattedDate value={address.removed_at} dateStyle="medium" timeStyle="short" />
                      </>
                    ) : address.verified_at !== undefined ? (
                      <>
                        <Message id="principals.addresses.verifiedAt" />{' '}
                        <FormattedDate value={address.verified_at} dateStyle="medium" timeStyle="short" />
                      </>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </>
      )}
    </Section>
  );
}

const notificationTones: Readonly<Record<NotificationState, StatusTone>> = {
  requested: 'info',
  submitted: 'success',
  failed: 'danger',
  no_address: 'warning',
};

// What the Principal was told, and whether it reached the delivery platform (TDD-identity-control-008
// §Operational Notes): the hundred most recent notifications, newest first. A failed request and one
// with no address are the two an operator acts on, so each says what it means.
function SecurityNotificationsSection({ principalId }: { readonly principalId: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const notifications = useSecuritySection(principalId, 'security-notifications', open);
  return (
    <Section
      title="principals.notifications.title"
      open={open}
      onOpen={() => {
        setOpen(true);
      }}
    >
      {notifications.isPending ? (
        <div aria-busy="true" />
      ) : notifications.isError ? (
        <ApiErrorPanel error={notifications.error} onRetry={() => void notifications.refetch()} />
      ) : notifications.data.length === 0 ? (
        <p className={styles['quiet']}>
          <Message id="principals.notifications.none" />
        </p>
      ) : (
        <Table.Root caption={<Message id="principals.notifications.title" />} captionHidden>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>
                <Message id="principals.notifications.when" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.notifications.event" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.notifications.state" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.notifications.recipients" />
              </Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {notifications.data.map((notification) => (
              <Table.Row key={notification.notification_id}>
                <Table.Cell>
                  <FormattedDate value={notification.occurred_at} dateStyle="medium" timeStyle="medium" />
                </Table.Cell>
                <Table.Cell>
                  {isNotifiedEvent(notification.event) ? (
                    <Message id={`principals.notifications.event.${notification.event}`} />
                  ) : (
                    <code>{notification.event}</code>
                  )}
                  {Object.entries(notification.details ?? {}).length === 0 ? null : (
                    <span className={styles['quiet']}>
                      {' '}
                      {Object.entries(notification.details ?? {})
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ')}
                    </span>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <StatusPill tone={notificationTones[notification.state]}>
                    <Message id={`principals.notifications.state.${notification.state}`} />
                  </StatusPill>
                  {notification.state === 'failed' || notification.state === 'no_address' ? (
                    <span className={styles['quiet']}>
                      {' '}
                      <Message
                        id={`principals.notifications.state.${notification.state}.means`}
                        values={{ attempts: notification.attempts }}
                      />
                    </span>
                  ) : null}
                </Table.Cell>
                <Table.Cell>{notification.recipients}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Section>
  );
}

function FederationSection({ principalId }: { readonly principalId: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const links = useSecuritySection(principalId, 'federation-links', open);
  return (
    <Section
      title="principals.federation.title"
      open={open}
      onOpen={() => {
        setOpen(true);
      }}
    >
      {links.isPending ? (
        <div aria-busy="true" />
      ) : links.isError ? (
        <ApiErrorPanel error={links.error} onRetry={() => void links.refetch()} />
      ) : links.data.length === 0 ? (
        <p className={styles['quiet']}>
          <Message id="principals.federation.none" />
        </p>
      ) : (
        <ul>
          {links.data.map((link) => (
            <li key={link.provider}>
              <Message
                id="principals.federation.link"
                values={{ provider: link.provider, user: link.user_name }}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function FindingsSection({ principalId }: { readonly principalId: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const findings = useSecuritySection(principalId, 'findings', open);
  return (
    <Section
      title="principals.findings.title"
      open={open}
      onOpen={() => {
        setOpen(true);
      }}
    >
      {findings.isPending ? (
        <div aria-busy="true" />
      ) : findings.isError ? (
        <ApiErrorPanel error={findings.error} onRetry={() => void findings.refetch()} />
      ) : findings.data.length === 0 ? (
        <p className={styles['quiet']}>
          <Message id="principals.findings.none" />
        </p>
      ) : (
        <ul>
          {findings.data.map((finding) => (
            <li key={finding.finding_id}>
              <Message
                id={
                  finding.resolved_at === null ? 'principals.findings.open' : 'principals.findings.resolved'
                }
                values={{ class: finding.class, resolution: finding.resolution ?? '' }}
              />{' '}
              <FormattedDate value={finding.detected_at} dateStyle="medium" timeStyle="short" />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// The Principal's sign-ins, failures and admin changes, from the kernel event record (TDD-identity-control-005
// 2.9.0): what an investigator read in the kernel's Admin Console before, here, recorded as a read.
// The record is filled by a scheduled sweep; running it now brings a sign-in from a minute ago in
// (TDD-identity-control-007), and the events are read again.
function EventsSection({ principalId }: { readonly principalId: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const events = useSecuritySection(principalId, 'events', open);
  const sweep = useKernelEventSweep(principalId);
  return (
    <Section
      title="principals.events.title"
      open={open}
      onOpen={() => {
        setOpen(true);
      }}
    >
      <div className={styles['actions']}>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="pulse" />}
          disabled={sweep.isPending}
          onClick={() => {
            sweep.mutate();
          }}
        >
          <Message id="principals.events.sweep" />
        </Button>
      </div>
      {sweep.isSuccess ? (
        <div className={styles['quiet']} role="status">
          <ul>
            {sweep.data.kinds.map((kind) => (
              <li key={kind.kind}>
                <Message
                  id={kind.truncated ? 'principals.events.sweep.truncated' : 'principals.events.sweep.done'}
                  values={{ kind: kind.kind, read: kind.read, recorded: kind.recorded }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {sweep.isError ? <MutationError error={sweep.error} /> : null}
      {events.isPending ? (
        <div aria-busy="true" />
      ) : events.isError ? (
        <ApiErrorPanel error={events.error} onRetry={() => void events.refetch()} />
      ) : events.data.length === 0 ? (
        <p className={styles['quiet']}>
          <Message id="principals.events.none" />
        </p>
      ) : (
        <Table.Root caption={<Message id="principals.events.title" />} captionHidden>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>
                <Message id="principals.events.when" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.events.event" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.events.outcome" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.events.where" />
              </Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {events.data.map((event, index) => (
              <Table.Row key={`${event.occurred_at}-${String(index)}`}>
                <Table.Cell>
                  <FormattedDate value={event.occurred_at} dateStyle="medium" timeStyle="medium" />
                </Table.Cell>
                <Table.Cell mono>
                  {event.type}{' '}
                  <Message
                    id={event.role === 'actor' ? 'principals.events.asActor' : 'principals.events.asSubject'}
                  />
                </Table.Cell>
                <Table.Cell>
                  <StatusPill tone={event.outcome === 'failure' ? 'danger' : 'success'}>
                    <Message
                      id={
                        event.outcome === 'failure'
                          ? 'principals.events.failure'
                          : 'principals.events.success'
                      }
                    />
                  </StatusPill>
                  {event.error === undefined ? null : <span className={styles['quiet']}> {event.error}</span>}
                </Table.Cell>
                <Table.Cell mono>{event.resource_type ?? event.client_id ?? ''}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Section>
  );
}

function Containment({
  principal,
  operator,
}: {
  readonly principal: PrincipalDetail;
  readonly operator: string | null;
}): ReactElement {
  const [open, setOpen] = useState<ContainmentAction | null>(null);
  const [outcome, setOutcome] = useState<{ command: Command; operation: SecurityOperation } | null>(null);
  const actions = containmentActions(principal, operator);
  let why: MessageKey | null = null;
  if (principal.principal_id === operator) {
    why = 'principals.contain.none.self';
  } else if (principal.subject_type === 'workload') {
    why = 'principals.contain.none.workload';
  } else if (actions.length === 0) {
    why = 'principals.contain.none.state';
  }
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="principals.contain.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="principals.contain.description" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        {why === null ? (
          <div className={styles['actions']}>
            {actions.map((action) => (
              <Button
                key={action}
                variant={action === 'restore' ? 'primary' : 'secondary'}
                aria-expanded={open === action}
                onClick={() => {
                  setOpen(action);
                  setOutcome(null);
                }}
              >
                <Message id={actionLabel[action]} />
              </Button>
            ))}
          </div>
        ) : (
          <p className={styles['quiet']}>
            <Message id={why} values={{ state: principal.state }} />
            {principal.subject_type === 'workload' ? (
              <>
                {' '}
                <Link to="/workloads">
                  <Message id="principals.contain.none.workload.link" />
                </Link>
              </>
            ) : null}
          </p>
        )}
        {open === null || !actions.includes(open) ? null : (
          <CommandForm
            principal={principal}
            command={open}
            onDone={(operation) => {
              setOutcome({ command: open, operation });
              setOpen(null);
            }}
            onCancel={() => {
              setOpen(null);
            }}
          />
        )}
        {outcome === null ? null : <Outcome command={outcome.command} operation={outcome.operation} />}
      </Panel.Body>
    </Panel.Root>
  );
}

function Summary({ principal }: { readonly principal: PrincipalDetail }): ReactElement {
  return (
    <Panel.Root>
      <Panel.Body>
        <dl className={styles['details']}>
          <dt>
            <Message id="principals.detail.state" />
          </dt>
          <dd>
            <StatusPill tone={stateTones[principal.state]}>
              <Message id={`principals.state.${principal.state}`} />
            </StatusPill>
          </dd>
          <dt>
            <Message id="principals.detail.principal" />
          </dt>
          <dd className={styles['subject']}>{principal.principal_id}</dd>
          <dt>
            <Message id="principals.search.column.type" />
          </dt>
          <dd>
            <Message id={`principals.subjectType.${principal.subject_type}`} />
          </dd>
          {principal.email === undefined ? null : (
            <>
              <dt>
                <Message id="principals.search.column.email" />
              </dt>
              <dd>{principal.email}</dd>
            </>
          )}
          <dt>
            <Message id="principals.detail.created" />
          </dt>
          <dd>
            <FormattedDate value={principal.created_at} dateStyle="medium" timeStyle="short" />
          </dd>
          {principal.quarantined_at === null ? null : (
            <>
              <dt>
                <Message id="principals.detail.quarantined" />
              </dt>
              <dd>
                <FormattedDate value={principal.quarantined_at} dateStyle="medium" timeStyle="short" />
                {principal.quarantine_reason === undefined ? null : ` — ${principal.quarantine_reason}`}
              </dd>
            </>
          )}
        </dl>
      </Panel.Body>
    </Panel.Root>
  );
}

// PrincipalDetailPage is one Principal and its security state (TDD-identity-experience-003
// §Principal Search and Security State). The summary is read on arrival; each section of security
// state is its own privileged read, made when it is opened.
export function PrincipalDetailPage({ principalId }: { readonly principalId: string }): ReactElement {
  const session = useSession();
  const principal = usePrincipalDetail(principalId);
  if (session.data?.authenticated !== true) {
    return session.isPending ? <div aria-busy="true" /> : <SignInRequired />;
  }
  const operator = session.data.principalId;
  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Link to="/principals">
            <Message id="principals.title" />
          </Link>
        </p>
        <h1 className={styles['title']}>{principal.data?.username ?? principalId}</h1>
      </header>
      {principal.isPending ? (
        <Panel.Root aria-busy="true" />
      ) : principal.isError ? (
        <ApiErrorPanel error={principal.error} onRetry={() => void principal.refetch()} />
      ) : (
        <>
          <Summary principal={principal.data} />
          <Containment principal={principal.data} operator={operator} />
          <SessionsSection principalId={principalId} />
          <AuthenticatorsSection principal={principal.data} operator={operator} />
          <NotificationAddressesSection principalId={principalId} />
          <SecurityNotificationsSection principalId={principalId} />
          <FederationSection principalId={principalId} />
          <FindingsSection principalId={principalId} />
          <EventsSection principalId={principalId} />
        </>
      )}
    </div>
  );
}
