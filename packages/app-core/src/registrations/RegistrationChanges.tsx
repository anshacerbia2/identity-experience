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
  changeKinds,
  changeValues,
  hasAudience,
  hasRedirectUris,
  lineEntries,
  openChange,
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
          <span className={styles['quiet']}>
            <CoreMessage id={kindLabel[change.kind]} />
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

// What a proposal form says for each kind: its title, its field, and why the API refuses an entry.
const proposeCopy: Readonly<
  Record<
    ChangeKind,
    {
      readonly title: CoreMessageKey;
      readonly body: CoreMessageKey;
      readonly field: CoreMessageKey;
      readonly rulesTitle: CoreMessageKey;
      readonly rules: readonly CoreMessageKey[];
    }
  >
> = {
  redirect_uris: {
    title: 'changes.propose.title',
    body: 'changes.propose.body',
    field: 'changes.propose.field',
    rulesTitle: 'changes.rules.title',
    rules: ['changes.rules.wildcard', 'changes.rules.https', 'changes.rules.exact'],
  },
  audience: {
    title: 'changes.propose.title.audience',
    body: 'changes.propose.body.audience',
    field: 'changes.propose.field.audience',
    rulesTitle: 'changes.rules.title.audience',
    rules: ['changes.rules.audience.remove', 'changes.rules.audience.add', 'changes.rules.audience.entry'],
  },
};

const registered = (registration: Registration, kind: ChangeKind): readonly string[] =>
  kind === 'audience' ? registration.audience : registration.redirect_uris;

// ProposeForm proposes the whole next set of one kind, against the version shown, with a reason.
// Nothing is judged here beyond splitting the lines: the API's sentence names the rule
// (TDD-identity-experience-004 §Validation Parity). Redirect URIs need at least one; an audience may
// be empty, a client whose tokens name no resource.
function ProposeForm({
  registration,
  kind,
  onDone,
  onCancel,
}: {
  readonly registration: Registration;
  readonly kind: ChangeKind;
  readonly onDone: (outcome: RegistrationChange) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const t = useCoreMessage();
  const propose = useProposeChange(registration.registration_id);
  const copy = proposeCopy[kind];
  const form = useForm<{ values: string; reason: string }>({
    defaultValues: { values: registered(registration, kind).join('\n'), reason: '' },
  });
  const submit = form.handleSubmit((values) => {
    propose.mutate(
      {
        kind,
        values: lineEntries(values.values),
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
          <CoreMessage id={copy.title} />
        </Panel.Title>
        <Panel.Description>
          <CoreMessage id={copy.body} />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextAreaField
          {...form.register('values', {
            validate: (value) =>
              kind === 'audience' || lineEntries(value).length > 0 || t('changes.propose.empty'),
          })}
          label={<CoreMessage id={copy.field} />}
          error={form.formState.errors.values?.message}
          spellCheck={false}
          required={kind === 'redirect_uris'}
        />
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        <div className={styles['stack']}>
          <span className={styles['quiet']}>
            <CoreMessage id={copy.rulesTitle} />
          </span>
          <ul className={styles['rules']}>
            {copy.rules.map((rule) => (
              <li key={rule}>
                <CoreMessage id={rule} />
              </li>
            ))}
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

type Notice =
  | 'applied.redirect_uris'
  | 'applied.audience'
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'superseded';

const noticeCopy: Readonly<Record<Notice, CoreMessageKey>> = {
  'applied.redirect_uris': 'changes.done.applied',
  'applied.audience': 'changes.done.applied.audience',
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

const openCopy: Readonly<Record<ChangeKind, CoreMessageKey>> = {
  redirect_uris: 'changes.propose.open',
  audience: 'changes.propose.open.audience',
};

// Registered shows one kind's set as it stands, and says so when an audience names no resource.
function Registered({
  label,
  values,
  empty,
}: {
  readonly label: CoreMessageKey;
  readonly values: readonly string[];
  readonly empty?: CoreMessageKey;
}): ReactElement {
  return (
    <div className={styles['stack']}>
      <span className={styles['quiet']}>
        <CoreMessage id={label} />
      </span>
      {values.length === 0 && empty !== undefined ? (
        <span className={styles['quiet']}>
          <CoreMessage id={empty} />
        </span>
      ) : (
        <ul className={styles['values']}>
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// RegistrationChanges is a registration's redirect URIs and audience, and the changes to them
// (ADR-IAM-003 §5.2, TDD-identity-experience-004 §Redirect URI Changes and §Audience Changes): the
// registered sets, a proposal of the next one of either kind, the open change with its before and
// after, and the changes decided. The API holds one open change per registration, of either kind,
// so nothing is proposed while one is open. provider adds approve and reject on a change the
// signed-in provider did not propose.
export function RegistrationChanges({
  registration,
  provider = false,
}: {
  readonly registration: Registration;
  readonly provider?: boolean;
}): ReactElement | null {
  const redirects = hasRedirectUris(registration);
  const audience = hasAudience(registration);
  const changes = useChanges(registration.registration_id, audience);
  const [proposing, setProposing] = useState<ChangeKind | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  if (!audience) {
    return null;
  }
  const kinds = changeKinds(registration);

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
        {open === undefined && kinds.length > 0 && proposing === null ? (
          <div className={styles['formActions']}>
            {kinds.map((kind) => (
              <Button
                key={kind}
                variant="secondary"
                icon={<Icon name="shield" />}
                aria-expanded={false}
                onClick={() => {
                  setProposing(kind);
                  setNotice(null);
                }}
              >
                <CoreMessage id={openCopy[kind]} />
              </Button>
            ))}
          </div>
        ) : null}
        {proposing !== null && open === undefined ? (
          <ProposeForm
            key={proposing}
            registration={registration}
            kind={proposing}
            onDone={(outcome) => {
              setProposing(null);
              setNotice(outcome.state === 'applied' ? `applied.${outcome.kind}` : 'proposed');
            }}
            onCancel={() => {
              setProposing(null);
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
        <CoreMessage id={redirects ? 'changes.title' : 'changes.title.audience'} />
      </h2>
      <p className={styles['quiet']}>
        <CoreMessage id={redirects ? 'changes.description' : 'changes.description.audience'} />
      </p>
      {redirects ? <Registered label="changes.current" values={registration.redirect_uris} /> : null}
      <Registered
        label="changes.current.audience"
        values={registration.audience}
        empty="changes.current.audience.none"
      />
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
