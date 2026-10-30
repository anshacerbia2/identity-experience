import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { MutationError } from '@identity-experience/app-core/api';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { Button, Icon, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';
import type { PrincipalDetail } from '@/domain/security';

import { useRelease } from './principals-api';
import styles from './PrincipalsPage.module.scss';

interface Values {
  readonly username: string;
  readonly reason: string;
}

// ReleaseQuarantine ends the reconciler's hold on a quarantined person (TDD-identity-control-001
// 1.18.0 §Leaving Quarantine; TDD-identity-experience-003 §Leaving Quarantine). The duplicate runbook
// comes first: the triage decides which kernel user is the person and deletes every other one. The
// form then names that user's username and a reason. The API reads the kernel, and refuses unless
// exactly one user carries the identifier and it is the one named; the page shows that refusal as the
// API's sentence. A release lands in suspended, never active: the restore is a separate command.
// The outcome is the caller's to show: once released, the Principal is read again as suspended, and
// this form is no longer offered.
export function ReleaseQuarantine({
  principal,
  onDone,
}: {
  readonly principal: PrincipalDetail;
  readonly onDone: () => void;
}): ReactElement {
  const t = useMessage();
  const [open, setOpen] = useState(false);
  const release = useRelease();
  const form = useForm<Values>({ defaultValues: { username: '', reason: '' } });

  if (!open) {
    return (
      <div className={styles['actions']}>
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(true);
          }}
        >
          <Message id="principals.release" />
        </Button>
      </div>
    );
  }

  const submit = form.handleSubmit((values) => {
    release.mutate(
      { principalId: principal.principal_id, username: values.username, reason: values.reason },
      { onSuccess: onDone },
    );
  });
  return (
    <div>
      <h3 className={styles['sectionTitle']}>
        <Message id="principals.release.title" />
      </h3>
      <p className={styles['quiet']}>
        <Message id="principals.release.body" />
      </p>
      <ul className={styles['quiet']}>
        <li>
          <Message id="principals.release.condition.triage" />
        </li>
        <li>
          <Message id="principals.release.condition.one" />
        </li>
        <li>
          <Message id="principals.release.condition.suspended" />
        </li>
      </ul>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          {...form.register('username', {
            validate: (value) => value.trim() !== '' || t('principals.release.username.required'),
          })}
          label={<Message id="principals.release.username" />}
          description={<Message id="principals.release.username.hint" />}
          error={form.formState.errors.username?.message}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {release.isError ? <MutationError error={release.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" disabled={release.isPending}>
            <Icon name="shield" />
            <Message id="principals.release" />
          </Button>
          <Button
            variant="ghost"
            disabled={release.isPending}
            onClick={() => {
              setOpen(false);
              release.reset();
            }}
          >
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </div>
  );
}
