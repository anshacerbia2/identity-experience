import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { useIntl } from 'react-intl';

import { MutationError } from '@identity-experience/app-core/api';
import {
  exceptionFields,
  exceptionHours,
  type ExceptionField,
} from '@identity-experience/app-core/domain/registration';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { Button, Icon, Panel, SelectField, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';

import { fieldLabel } from './labels';
import { useGrantException } from './registrations-api';
import styles from './RegistrationsPage.module.scss';

interface Values {
  readonly fieldClass: ExceptionField;
  readonly actor: string;
  readonly hours: string;
  readonly reason: string;
}

// ExceptionForm grants a drift exception: one Keycloak user, one field class, at most 24 hours. It
// offers only the field classes and durations the API accepts. Offered for an active registration
// only, which is the only kind the API grants one for.
export function ExceptionForm({ registrationId }: { readonly registrationId: string }): ReactElement {
  const t = useMessage();
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [grantedUntil, setGrantedUntil] = useState<string | null>(null);
  const grant = useGrantException(registrationId);
  const form = useForm<Values>({
    defaultValues: { fieldClass: 'redirect_uris', actor: '', hours: '1', reason: '' },
  });

  if (!open) {
    return (
      <div className={styles['formActions']}>
        <Button
          variant="secondary"
          icon={<Icon name="clock" />}
          onClick={() => {
            setOpen(true);
            setGrantedUntil(null);
          }}
        >
          <Message id="exception.open" />
        </Button>
        {grantedUntil === null ? null : (
          <p className={styles['success']} role="status">
            <Icon name="check" />
            <Message id="exception.done" values={{ until: grantedUntil }} />
          </p>
        )}
      </div>
    );
  }

  const submit = form.handleSubmit((values) => {
    grant.mutate(
      {
        fieldClass: values.fieldClass,
        actor: values.actor,
        reason: values.reason,
        hours: Number(values.hours),
      },
      {
        onSuccess: (exception) => {
          setGrantedUntil(intl.formatDate(exception.expires_at, { dateStyle: 'medium', timeStyle: 'short' }));
          setOpen(false);
          form.reset();
        },
      },
    );
  });

  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="exception.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="exception.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <div className={styles['formRow']}>
          <SelectField
            {...form.register('fieldClass')}
            label={<Message id="exception.field.label" />}
            options={exceptionFields.map((field) => ({ value: field, label: t(fieldLabel(field)) }))}
          />
          <SelectField
            {...form.register('hours')}
            label={<Message id="exception.duration.label" />}
            options={exceptionHours.map((hours) => ({
              value: String(hours),
              label: t('exception.duration.option', { hours }),
            }))}
          />
        </div>
        <TextField
          {...form.register('actor', {
            validate: (value) => value.trim() !== '' || t('exception.actor.required'),
          })}
          label={<Message id="exception.actor.label" />}
          hint={<Message id="exception.actor.hint" />}
          error={form.formState.errors.actor?.message}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {grant.isError ? <MutationError error={grant.error} /> : null}
        <div className={styles['formActions']}>
          <Button type="submit" disabled={grant.isPending} icon={<Icon name="clock" />}>
            <Message id="exception.submit" />
          </Button>
          <Button
            variant="ghost"
            disabled={grant.isPending}
            onClick={() => {
              setOpen(false);
              form.reset();
            }}
          >
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}
