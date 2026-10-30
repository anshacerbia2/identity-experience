import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiError, MutationError, useCommandPost } from '@identity-experience/app-core/api';
import { normalizeReason } from '@identity-experience/app-core/domain/reason';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { useSession } from '@identity-experience/app-core/session';
import { Button, Icon } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import {
  credentialEstablished,
  issuePath,
  type TemporaryPasswordAnswer,
  type TemporaryPasswordIssuance,
} from '@/domain/temporary-password';

import styles from './PrincipalsPage.module.scss';

// What the panel holds. The value lives here, in this component's state, and nowhere else: the command
// is sent with useCommandPost, not useMutation, so no query or mutation cache ever holds the answer,
// and nothing writes it to a URL, browser storage or a log (TDD-identity-experience-003 1.28.0 §A First
// Credential, Shown Once; STD-IAM-001 2.8.0 §3.1). Unmounting the panel, which leaving the page does,
// discards it.
type Phase =
  | { readonly kind: 'closed' }
  | { readonly kind: 'form' }
  | { readonly kind: 'shown'; readonly value: string; readonly lapsesAt: string }
  | { readonly kind: 'replayed'; readonly lapsesAt: string }
  | { readonly kind: 'handed' };

type Copy = 'none' | 'copied' | 'failed';

function Shown({
  value,
  lapsesAt,
  onDone,
}: {
  readonly value: string;
  readonly lapsesAt: string;
  readonly onDone: () => void;
}): ReactElement {
  const [copy, setCopy] = useState<Copy>('none');
  return (
    <section className={styles['form']} aria-labelledby="temporary-password-title">
      <h3 id="temporary-password-title" className={styles['sectionTitle']}>
        <Message id="principals.password.shown.title" />
      </h3>
      <dl className={styles['created']}>
        <dt>
          <Message id="principals.password.value" />
        </dt>
        <dd>
          <code className={styles['secret']}>{value}</code>
        </dd>
        <dt>
          <Message id="principals.password.lapses" />
        </dt>
        <dd>
          <FormattedDate value={lapsesAt} dateStyle="medium" timeStyle="short" />
        </dd>
      </dl>
      <p className={styles['quiet']}>
        <Message id="principals.password.lapsesNote" />
      </p>
      <p className={styles['warning']}>
        <Icon name="alert" />
        <Message id="principals.password.handover" />
      </p>
      <div className={styles['actions']}>
        <Button
          variant="secondary"
          size="small"
          onClick={() => {
            setCopy('none');
            navigator.clipboard.writeText(value).then(
              () => {
                setCopy('copied');
              },
              () => {
                setCopy('failed');
              },
            );
          }}
        >
          <Icon name="key" />
          <Message id="principals.password.copy" />
        </Button>
        <Button variant="primary" size="small" onClick={onDone}>
          <Icon name="check" />
          <Message id="principals.password.done" />
        </Button>
      </div>
      {/* The copy's result, announced: the region is in the page before it is filled. */}
      <p className={copy === 'failed' ? styles['quiet'] : styles['success']} role="status">
        {copy === 'copied' ? <Message id="principals.password.copied" /> : null}
        {copy === 'failed' ? <Message id="principals.password.copyFailed" /> : null}
      </p>
    </section>
  );
}

// TemporaryPassword issues a person's first credential (ADR-IAM-010): a reason, then the value shown
// once with its lapse and how to hand it over. `fresh` is the panel a new person's creation shows;
// otherwise it is a Principal's page, where a new value replaces an earlier one.
export function TemporaryPassword({
  principalId,
  fresh = false,
}: {
  readonly principalId: string;
  readonly fresh?: boolean;
}): ReactElement {
  const post = useCommandPost();
  const session = useSession();
  const token = session.data?.authenticated === true ? session.data.csrfToken : '';
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });

  const open = () => {
    setError(null);
    form.reset({ reason: '' });
    setPhase({ kind: 'form' });
  };

  const submit = form.handleSubmit(async (values) => {
    setPending(true);
    setError(null);
    try {
      const answer = await post<TemporaryPasswordAnswer>(
        issuePath(principalId),
        {},
        { csrfToken: token, headers: { 'x-administrative-reason': normalizeReason(values.reason) } },
      );
      const issued: TemporaryPasswordIssuance = answer.temporary_password;
      setPhase(
        issued.value === undefined || issued.value === ''
          ? { kind: 'replayed', lapsesAt: issued.lapses_at }
          : { kind: 'shown', value: issued.value, lapsesAt: issued.lapses_at },
      );
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setPending(false);
    }
  });

  const issueLabel = fresh ? 'principals.password.issue' : 'principals.password.issueNew';

  switch (phase.kind) {
    case 'shown':
      return (
        <Shown
          value={phase.value}
          lapsesAt={phase.lapsesAt}
          onDone={() => {
            setPhase({ kind: 'handed' });
          }}
        />
      );
    case 'closed':
    case 'handed':
    case 'replayed':
      return (
        <div className={styles['section']}>
          {phase.kind === 'handed' ? (
            <p className={styles['success']} role="status">
              <Icon name="check" />
              <Message id="principals.password.cleared" />
            </p>
          ) : null}
          {phase.kind === 'replayed' ? (
            <p className={styles['quiet']} role="alert">
              <Message id="principals.password.replayed" />
            </p>
          ) : null}
          <div className={styles['actions']}>
            <Button variant="secondary" onClick={open}>
              <Icon name="key" />
              <Message id={phase.kind === 'closed' ? issueLabel : 'principals.password.issueNew'} />
            </Button>
          </div>
        </div>
      );
    case 'form':
      break;
  }

  const refusal = error instanceof ApiError ? error : null;
  return (
    <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
      <p className={styles['quiet']}>
        <Message id="principals.password.body" />
      </p>
      <ReasonField registration={form.register('reason', reasonRules)} error={form.formState.errors.reason} />
      {error === null ? null : credentialEstablished(refusal) ? (
        <p className={styles['quiet']} role="alert">
          <Message id="principals.password.established" />
        </p>
      ) : (
        <MutationError error={error} />
      )}
      <div className={styles['actions']}>
        <Button type="submit" disabled={pending}>
          <Icon name="key" />
          <Message id="principals.password.submit" />
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setError(null);
            setPhase({ kind: 'closed' });
          }}
        >
          <Message id="form.cancel" />
        </Button>
      </div>
      {pending ? (
        <p className={styles['quiet']} role="status">
          <Message id="principals.password.sending" />
        </p>
      ) : null}
    </form>
  );
}
