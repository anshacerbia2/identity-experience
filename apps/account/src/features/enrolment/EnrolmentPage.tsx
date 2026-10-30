import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { signInHref } from '@identity-experience/app-core/session';
import { Button, Icon, Panel, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import { forgetInvitationToken, heldInvitationToken } from '@/core/invitation-fragment';
import {
  codeLength,
  isCode,
  type EnrolledAccount,
  type RequestOutcome,
  type VerifyOutcome,
} from '@/domain/enrolment';

import { requestCode, verifyCode } from './enrolment-api';
import styles from './EnrolmentPage.module.scss';

// EnrolmentPage creates an account for a person invited to a Tenant who holds none (ADR-IAM-011 §5.1
// to §5.4; TDD-identity-experience-001 1.24.0 §Enrolment From an Invitation). It is reached from
// organization-experience's "I do not have an account", with the invitation token in the fragment,
// and needs no sign-in. Three steps: ask for a code, return it, and see the temporary password once;
// then sign in, choose a password, and accept the invitation from its link.
//
// What the page holds lives in its memory alone: the token (core/invitation-fragment.ts), the
// enrolment identifier, and the temporary password. None is written to a URL, browser storage, a
// cache or a log, and leaving the page discards them (STD-IAM-001 3.1.0 §3.1).

type Phase =
  | { readonly kind: 'start'; readonly notice: RequestNotice | null }
  | { readonly kind: 'code'; readonly enrolmentId: string; readonly notice: VerifyNotice | null }
  | { readonly kind: 'created'; readonly account: EnrolledAccount };

type RequestNotice = Exclude<RequestOutcome, { readonly kind: 'sent' }>;
type VerifyNotice = Exclude<VerifyOutcome, { readonly kind: 'created' }>;

// One sentence per answer (TDD-identity-experience-001 1.24.0 §One Sentence per Answer).
const requestSentence: Readonly<Record<RequestNotice['kind'], MessageKey>> = {
  limited: 'enrolment.request.limited',
  refused: 'enrolment.request.refused',
  unavailable: 'enrolment.request.unavailable',
};

const verifySentence: Readonly<Record<VerifyNotice['kind'], MessageKey>> = {
  wrong: 'enrolment.verify.wrong',
  limited: 'enrolment.verify.limited',
  unavailable: 'enrolment.verify.unavailable',
};

function Notice({ id, minutes }: { readonly id: MessageKey; readonly minutes?: number }): ReactElement {
  return (
    <p className={styles['notice']} role="alert">
      <Icon name="alert" />
      <Message id={id} values={{ minutes: minutes ?? 1 }} />
    </p>
  );
}

function Start({
  token,
  notice,
  onSent,
  onNotice,
}: {
  readonly token: string;
  readonly notice: RequestNotice | null;
  readonly onSent: (enrolmentId: string) => void;
  readonly onNotice: (notice: RequestNotice) => void;
}): ReactElement {
  const [pending, setPending] = useState(false);
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="enrolment.start.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="enrolment.start.body" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        {notice === null ? null : (
          <Notice
            id={requestSentence[notice.kind]}
            {...(notice.kind === 'limited' ? { minutes: notice.minutes } : {})}
          />
        )}
        <div className={styles['actions']}>
          <Button
            disabled={pending}
            onClick={() => {
              setPending(true);
              void requestCode(token).then((outcome) => {
                setPending(false);
                if (outcome.kind === 'sent') {
                  onSent(outcome.enrolmentId);
                } else {
                  onNotice(outcome);
                }
              });
            }}
          >
            <Icon name="arrow" />
            <Message id="enrolment.start.send" />
          </Button>
        </div>
      </Panel.Body>
    </Panel.Root>
  );
}

function Code({
  enrolmentId,
  notice,
  onCreated,
  onNotice,
  onRestart,
}: {
  readonly enrolmentId: string;
  readonly notice: VerifyNotice | null;
  readonly onCreated: (account: EnrolledAccount) => void;
  readonly onNotice: (notice: VerifyNotice) => void;
  readonly onRestart: () => void;
}): ReactElement {
  const t = useMessage();
  const [pending, setPending] = useState(false);
  const form = useForm<{ code: string }>({ defaultValues: { code: '' } });
  const submit = form.handleSubmit(async (values) => {
    setPending(true);
    const outcome = await verifyCode(enrolmentId, values.code);
    setPending(false);
    if (outcome.kind === 'created') {
      onCreated(outcome.account);
    } else {
      onNotice(outcome);
    }
  });
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="enrolment.code.title" />
        </Panel.Title>
        <Panel.Description>
          {/* One sentence for every token: it does not say whether the invitation can be used. */}
          <Message id="enrolment.code.sent" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
          <TextField
            {...form.register('code', {
              validate: (value) => isCode(value) || t('enrolment.code.invalid', { length: codeLength }),
            })}
            label={<Message id="enrolment.code.label" />}
            description={<Message id="enrolment.code.hint" values={{ length: codeLength }} />}
            error={form.formState.errors.code?.message}
            inputMode="numeric"
            autoComplete="one-time-code"
            spellCheck={false}
            required
          />
          {notice === null ? null : (
            <Notice
              id={verifySentence[notice.kind]}
              {...(notice.kind === 'limited' ? { minutes: notice.minutes } : {})}
            />
          )}
          <div className={styles['actions']}>
            <Button type="submit" disabled={pending}>
              <Icon name="key" />
              <Message id="enrolment.code.submit" />
            </Button>
            {notice?.kind === 'wrong' ? (
              <Button variant="secondary" disabled={pending} onClick={onRestart}>
                <Message id="enrolment.code.restart" />
              </Button>
            ) : null}
          </div>
        </form>
      </Panel.Body>
    </Panel.Root>
  );
}

type Copy = 'none' | 'copied' | 'failed';

function Created({ account }: { readonly account: EnrolledAccount }): ReactElement {
  const [copy, setCopy] = useState<Copy>('none');
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="enrolment.created.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="enrolment.created.body" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        <dl className={styles['account']}>
          <dt>
            <Message id="enrolment.created.username" />
          </dt>
          <dd>{account.username}</dd>
          <dt>
            <Message id="enrolment.created.password" />
          </dt>
          <dd>
            <code className={styles['secret']} data-temporary-password="">
              {account.temporaryPassword}
            </code>
          </dd>
          <dt>
            <Message id="enrolment.created.lapses" />
          </dt>
          <dd>
            <FormattedDate value={account.lapsesAt} dateStyle="medium" timeStyle="short" />
          </dd>
        </dl>
        <p className={styles['notice']}>
          <Icon name="alert" />
          <Message id="enrolment.created.once" />
        </p>
        <div className={styles['actions']}>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setCopy('none');
              navigator.clipboard.writeText(account.temporaryPassword).then(
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
            <Message id="enrolment.created.copy" />
          </Button>
          {copy === 'none' ? null : (
            <span className={styles['quiet']} role="status">
              <Message id={copy === 'copied' ? 'enrolment.created.copied' : 'enrolment.created.copyFailed'} />
            </span>
          )}
        </div>
        <p className={styles['quiet']}>
          <Message id="enrolment.created.next" />
        </p>
        <div className={styles['actions']}>
          {/* The hosted login: the kernel asks for the temporary password, then for the person's own. */}
          <Button href={signInHref('/account/')}>
            <Icon name="arrow" />
            <Message id="enrolment.created.continue" />
          </Button>
        </div>
      </Panel.Body>
    </Panel.Root>
  );
}

export function EnrolmentPage(): ReactElement {
  const [token] = useState(heldInvitationToken);
  const [phase, setPhase] = useState<Phase>({ kind: 'start', notice: null });

  let body: ReactElement;
  if (phase.kind === 'created') {
    body = <Created account={phase.account} />;
  } else if (token === null) {
    body = (
      <Panel.Root>
        <Panel.Header>
          <Panel.Title>
            <Message id="enrolment.missing.title" />
          </Panel.Title>
          <Panel.Description>
            <Message id="enrolment.missing.body" />
          </Panel.Description>
        </Panel.Header>
      </Panel.Root>
    );
  } else if (phase.kind === 'code') {
    body = (
      <Code
        key={phase.enrolmentId}
        enrolmentId={phase.enrolmentId}
        notice={phase.notice}
        onCreated={(account) => {
          forgetInvitationToken();
          setPhase({ kind: 'created', account });
        }}
        onNotice={(notice) => {
          setPhase({ kind: 'code', enrolmentId: phase.enrolmentId, notice });
        }}
        onRestart={() => {
          setPhase({ kind: 'start', notice: null });
        }}
      />
    );
  } else {
    body = (
      <Start
        token={token}
        notice={phase.notice}
        onSent={(enrolmentId) => {
          setPhase({ kind: 'code', enrolmentId, notice: null });
        }}
        onNotice={(notice) => {
          setPhase({ kind: 'start', notice });
        }}
      />
    );
  }

  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Message id="enrolment.eyebrow" />
        </p>
        <h1 className={styles['title']}>
          <Message id="enrolment.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="enrolment.lead" />
        </p>
      </header>
      {body}
    </div>
  );
}
