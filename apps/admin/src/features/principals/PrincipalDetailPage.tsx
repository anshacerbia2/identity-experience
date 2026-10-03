import { Link } from '@tanstack/react-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError, useIdempotencyKey } from '@identity-experience/app-core/api';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Button, Icon, Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import {
  canRevoke,
  containmentActions,
  firstFactorsAfter,
  revocable,
  type Authenticator,
  type ContainmentAction,
  type PrincipalDetail,
  type SecurityOperation,
} from '@/domain/security';

import { stateTones } from './labels';
import styles from './PrincipalsPage.module.scss';
import { usePrincipalDetail, useSecurityCommand, useSecuritySection } from './security-api';

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
          <FederationSection principalId={principalId} />
          <FindingsSection principalId={principalId} />
        </>
      )}
    </div>
  );
}
