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

import { useChanges, useDecideChange, useProposeChange } from './registration-api';
import styles from './Registration.module.scss';
import { ApiError } from '../api/api-client';
import { ApiErrorPanel } from '../api/ApiErrorPanel';
import { MutationError } from '../api/MutationError';
import {
  changeable,
  changeValues,
  openChange,
  redirectLines,
  setDiff,
  type ChangeDecision,
  type ChangeKind,
  type ChangeState,
  type Registration,
  type RegistrationChange,
} from '../domain/registration';
import { ReasonField, reasonRules } from '../forms/ReasonField';
import type { CoreMessageKey } from '../i18n/core-messages';
import { CoreMessage, useCoreMessage } from '../i18n/CoreMessage';
import { useSession } from '../session/session';

const versionConflict = 'https://problems.scnehaux.com/version-conflict';

const stateTones: Readonly<Record<ChangeState, StatusTone>> = {
  proposed: 'info',
  applied: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
  superseded: 'warning',
};

// kindLabel names what a change's before/after values are: redirect URIs, or an audience of
// resource client_keys. A registration's own redirect URIs and audience class are shown
// elsewhere; this is only ever used to label one change in a list that can hold both kinds.
const kindLabel: Readonly<Record<ChangeKind, CoreMessageKey>> = {
  redirect_uris: 'changes.kind.redirect_uris',
  audience: 'changes.kind.audience',
};

function useMe(): string | null {
  const session = useSession();
  return session.data?.authenticated === true ? session.data.principalId : null;
}

function Who({ principal, me }: { readonly principal: string; readonly me: string | null }): ReactElement {
  return principal === me ? <CoreMessage id="changes.you" /> : <code>{principal}</code>;
}

// ChangeDiffList is a change's before and after as the API recorded them when it was proposed: what
// it adds, removes and keeps, each said in words and not by colour alone.
function ChangeDiffList({ change }: { readonly change: RegistrationChange }): ReactElement {
  const { before, after } = changeValues(change);
  const diff = setDiff(before, after);
  const rows: readonly { readonly uri: string; readonly label: CoreMessageKey; readonly tone: StatusTone }[] =
    [
      ...diff.added.map((uri) => ({ uri, label: 'changes.diff.added' as const, tone: 'success' as const })),
      ...diff.removed.map((uri) => ({
        uri,
        label: 'changes.diff.removed' as const,
        tone: 'danger' as const,
      })),
      ...diff.kept.map((uri) => ({ uri, label: 'changes.diff.kept' as const, tone: 'neutral' as const })),
    ];
  return (
    <ul className={styles['values']}>
      {rows.map((row) => (
        <li key={`${row.label}:${row.uri}`} className={styles['diffRow']}>
          <StatusPill tone={row.tone}>
            <CoreMessage id={row.label} />
          </StatusPill>
          <span>{row.uri}</span>
        </li>
      ))}
    </ul>
  );
}

// ChangeCard is one change: its client, its before and after, who proposed it and why, and where it
// stands. The approval queue and a registration's page show the same card.
export function ChangeCard({
  change,
  heading,
  children,
}: {
  readonly change: RegistrationChange;
  readonly heading?: ReactElement;
  readonly children?: ReactElement | null;
}): ReactElement {
  const me = useMe();
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>{heading ?? <CoreMessage id={`changes.state.${change.state}`} />}</Panel.Title>
        <Panel.Description>
          <span className={styles['meta']}>
            <CoreMessage id="changes.card.proposed" />
            <Who principal={change.proposed_by} me={me} />
            <FormattedDate value={change.proposed_at} dateStyle="medium" timeStyle="short" />
          </span>
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        <div className={styles['stack']}>
          <span className={styles['quiet']}>
            <CoreMessage id="changes.card.reason" values={{ reason: change.proposal_reason }} />
          </span>
          <ChangeDiffList change={change} />
          {change.state === 'proposed' && change.approval_required ? (
            <span className={styles['quiet']}>
              <CoreMessage id="changes.waiting" />
            </span>
          ) : null}
          {children}
        </div>
      </Panel.Body>
    </Panel.Root>
  );
}

const decisionCopy: Readonly<
  Record<
    ChangeDecision,
    { readonly title: CoreMessageKey; readonly body: CoreMessageKey; readonly done: CoreMessageKey }
  >
> = {
  approve: {
    title: 'changes.decide.approve.title',
    body: 'changes.decide.approve.body',
    done: 'changes.done.approved',
  },
  reject: {
    title: 'changes.decide.reject.title',
    body: 'changes.decide.reject.body',
    done: 'changes.done.rejected',
  },
  withdraw: {
    title: 'changes.decide.withdraw.title',
    body: 'changes.decide.withdraw.body',
    done: 'changes.done.withdrawn',
  },
};

function DecideForm({
  change,
  decision,
  onDone,
  onCancel,
}: {
  readonly change: RegistrationChange;
  readonly decision: ChangeDecision;
  readonly onDone: (decision: ChangeDecision, outcome: RegistrationChange) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const decide = useDecideChange(change.registration_id);
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    decide.mutate(
      { changeId: change.change_id, decision, reason: values.reason },
      {
        onSuccess: (outcome) => {
          onDone(decision, outcome);
        },
      },
    );
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <CoreMessage id={decisionCopy[decision].title} />
        </Panel.Title>
        <Panel.Description>
          <CoreMessage id={decisionCopy[decision].body} />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {decide.isError ? <MutationError error={decide.error} /> : null}
        <div className={styles['formActions']}>
          <Button
            type="submit"
            variant={decision === 'approve' ? 'primary' : 'danger'}
            disabled={decide.isPending}
            icon={<Icon name={decision === 'approve' ? 'check' : 'shield'} />}
          >
            <CoreMessage id={`changes.${decision}`} />
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={decide.isPending}>
            <CoreMessage id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

// ChangeActions offers the decisions the signed-in person may take on an open change: approve and
// reject for a provider who did not propose it, withdraw for its proposer. The API refuses every
// other one; offering none of them keeps the page from inviting a refusal.
export function ChangeActions({
  change,
  provider,
  onDone,
}: {
  readonly change: RegistrationChange;
  readonly provider: boolean;
  readonly onDone?: (decision: ChangeDecision, outcome: RegistrationChange) => void;
}): ReactElement | null {
  const me = useMe();
  const [open, setOpen] = useState<ChangeDecision | null>(null);
  if (change.state !== 'proposed') {
    return null;
  }
  const mine = change.proposed_by === me;
  const decisions: readonly ChangeDecision[] = [
    ...(provider && !mine ? (['approve', 'reject'] as const) : []),
    ...(mine ? (['withdraw'] as const) : []),
  ];
  return (
    <div className={styles['stack']}>
      {provider && mine ? (
        <span className={styles['quiet']}>
          <CoreMessage id="changes.ownProposal" />
        </span>
      ) : null}
      {decisions.length === 0 ? null : (
        <div className={styles['formActions']}>
          {decisions.map((decision) => (
            <Button
              key={decision}
              variant={decision === 'approve' ? 'primary' : 'secondary'}
              size="sm"
              aria-expanded={open === decision}
              onClick={() => {
                setOpen(decision);
              }}
            >
              <CoreMessage id={`changes.${decision}`} />
            </Button>
          ))}
        </div>
      )}
      {open === null ? null : (
        <DecideForm
          key={open}
          change={change}
          decision={open}
          onDone={(decision, outcome) => {
            setOpen(null);
            onDone?.(decision, outcome);
          }}
          onCancel={() => {
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function ProposeForm({
  registration,
  onDone,
  onCancel,
}: {
  readonly registration: Registration;
  readonly onDone: (outcome: RegistrationChange) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const t = useCoreMessage();
  const propose = useProposeChange(registration.registration_id);
  const form = useForm<{ uris: string; reason: string }>({
    defaultValues: { uris: registration.redirect_uris.join('\n'), reason: '' },
  });
  const submit = form.handleSubmit((values) => {
    propose.mutate(
      {
        redirectUris: redirectLines(values.uris),
        expectedVersion: registration.version,
        reason: values.reason,
      },
      { onSuccess: onDone },
    );
  });
  const conflict = propose.error instanceof ApiError && propose.error.type === versionConflict;
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <CoreMessage id="changes.propose.title" />
        </Panel.Title>
        <Panel.Description>
          <CoreMessage id="changes.propose.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextAreaField
          {...form.register('uris', {
            validate: (value) => redirectLines(value).length > 0 || t('changes.propose.empty'),
          })}
          label={<CoreMessage id="changes.propose.field" />}
          error={form.formState.errors.uris?.message}
          spellCheck={false}
          required
        />
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        <div className={styles['stack']}>
          <span className={styles['quiet']}>
            <CoreMessage id="changes.rules.title" />
          </span>
          <ul className={styles['rules']}>
            <li>
              <CoreMessage id="changes.rules.wildcard" />
            </li>
            <li>
              <CoreMessage id="changes.rules.https" />
            </li>
            <li>
              <CoreMessage id="changes.rules.exact" />
            </li>
          </ul>
        </div>
        {conflict ? (
          <p className={styles['quiet']} role="alert">
            <CoreMessage id="changes.versionConflict" />
          </p>
        ) : propose.isError ? (
          <MutationError error={propose.error} />
        ) : null}
        <div className={styles['formActions']}>
          <Button type="submit" disabled={propose.isPending} icon={<Icon name="shield" />}>
            <CoreMessage id="changes.propose.submit" />
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={propose.isPending}>
            <CoreMessage id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

function History({ changes }: { readonly changes: readonly RegistrationChange[] }): ReactElement | null {
  const me = useMe();
  if (changes.length === 0) {
    return null;
  }
  return (
    <Table.Root caption={<CoreMessage id="changes.history.caption" />}>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>
            <CoreMessage id="changes.column.outcome" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <CoreMessage id="changes.column.values" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <CoreMessage id="changes.column.decidedBy" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <CoreMessage id="changes.column.reason" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <CoreMessage id="changes.column.decided" />
          </Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {changes.map((change) => (
          <Table.Row key={change.change_id}>
            <Table.Cell>
              <StatusPill tone={stateTones[change.state]}>
                <CoreMessage id={`changes.state.${change.state}`} />
              </StatusPill>
            </Table.Cell>
            <Table.Cell mono>
              <span className={styles['quiet']}>
                <CoreMessage id={kindLabel[change.kind]} />
              </span>
              <ul className={styles['values']}>
                {changeValues(change).after.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            </Table.Cell>
            <Table.Cell mono>
              {change.decided_by === null ? null : <Who principal={change.decided_by} me={me} />}
            </Table.Cell>
            <Table.Cell>{change.decision_reason ?? ''}</Table.Cell>
            <Table.Cell>
              {change.decided_at === null ? null : (
                <FormattedDate value={change.decided_at} dateStyle="medium" timeStyle="short" />
              )}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

type Notice = 'applied' | 'proposed' | 'approved' | 'rejected' | 'withdrawn' | 'superseded';

const noticeCopy: Readonly<Record<Notice, CoreMessageKey>> = {
  applied: 'changes.done.applied',
  proposed: 'changes.done.proposed',
  approved: 'changes.done.approved',
  rejected: 'changes.done.rejected',
  withdrawn: 'changes.done.withdrawn',
  superseded: 'changes.done.superseded',
};

const decided = (decision: ChangeDecision, outcome: RegistrationChange): Notice => {
  if (decision === 'approve') {
    return outcome.state === 'superseded' ? 'superseded' : 'approved';
  }
  return decision === 'reject' ? 'rejected' : 'withdrawn';
};

// RedirectUriChanges is a registration's redirect URIs and the changes to them (ADR-IAM-003 §5.2,
// TDD-identity-experience-004 §Redirect URI Changes): the registered set, a proposal of the next
// one, the open change with its before and after, and the changes decided. provider adds approve
// and reject on a change the signed-in provider did not propose.
export function RedirectUriChanges({
  registration,
  provider = false,
}: {
  readonly registration: Registration;
  readonly provider?: boolean;
}): ReactElement | null {
  const hasRedirects = registration.profile === 'public' || registration.profile === 'confidential';
  const changes = useChanges(registration.registration_id, hasRedirects);
  const [proposing, setProposing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  if (!hasRedirects) {
    return null;
  }

  let body: ReactElement;
  if (changes.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (changes.isError) {
    body = (
      <ApiErrorPanel
        error={changes.error}
        onRetry={() => {
          void changes.refetch();
        }}
      />
    );
  } else {
    const open = openChange(changes.data);
    body = (
      <>
        {open === undefined ? null : (
          <ChangeCard change={open}>
            <ChangeActions
              change={open}
              provider={provider}
              onDone={(decision, outcome) => {
                setNotice(decided(decision, outcome));
              }}
            />
          </ChangeCard>
        )}
        {open === undefined && changeable(registration) && !proposing ? (
          <div className={styles['formActions']}>
            <Button
              variant="secondary"
              icon={<Icon name="shield" />}
              aria-expanded={false}
              onClick={() => {
                setProposing(true);
                setNotice(null);
              }}
            >
              <CoreMessage id="changes.propose.open" />
            </Button>
          </div>
        ) : null}
        {proposing && open === undefined ? (
          <ProposeForm
            registration={registration}
            onDone={(outcome) => {
              setProposing(false);
              setNotice(outcome.state === 'applied' ? 'applied' : 'proposed');
            }}
            onCancel={() => {
              setProposing(false);
            }}
          />
        ) : null}
        <History changes={changes.data.filter((change) => change.state !== 'proposed')} />
      </>
    );
  }

  return (
    <section className={styles['section']} aria-labelledby="changes-title">
      <h2 id="changes-title" className={styles['sectionTitle']}>
        <CoreMessage id="changes.title" />
      </h2>
      <p className={styles['quiet']}>
        <CoreMessage id="changes.description" />
      </p>
      <span className={styles['quiet']}>
        <CoreMessage id="changes.current" />
      </span>
      <ul className={styles['values']}>
        {registration.redirect_uris.map((uri) => (
          <li key={uri}>{uri}</li>
        ))}
      </ul>
      {notice === null ? null : (
        <p className={notice === 'superseded' ? styles['quiet'] : styles['success']} role="status">
          <Icon name={notice === 'superseded' ? 'alert' : 'check'} />
          <CoreMessage id={noticeCopy[notice]} />
        </p>
      )}
      {body}
    </section>
  );
}
