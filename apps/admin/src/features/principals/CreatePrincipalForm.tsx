import { useRef, useState, type ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button, Icon, Panel, SelectField, TextField } from '@identity-experience/ui';

import { MutationError } from '@/core/api/MutationError';
import { Message, useMessage } from '@/core/i18n/Message';
import {
  createRequest,
  isPrincipalId,
  subjectTypes,
  type PrincipalCreated,
  type SubjectType,
} from '@/domain/principal';

import { useCreatePrincipal } from './principals-api';
import styles from './PrincipalsPage.module.scss';

interface Values {
  readonly subjectType: SubjectType;
  readonly username: string;
  readonly email: string;
  readonly workloadOwner: string;
}

const empty: Values = { subjectType: 'human', username: '', email: '', workloadOwner: '' };

// useIdempotencyKey keeps one key per distinct request. Resubmitting the same values after an
// outage reuses it, so the API answers with the Principal the first attempt created instead of
// creating a second; changing a value is a new request and takes a new key, which the API would
// otherwise refuse as a key reused for something else.
function useIdempotencyKey(): (request: unknown) => string {
  const last = useRef<{ digest: string; key: string } | null>(null);
  return (request) => {
    const digest = JSON.stringify(request);
    if (last.current?.digest !== digest) {
      last.current = { digest, key: crypto.randomUUID() };
    }
    return last.current.key;
  };
}

function Created({
  created,
  onAnother,
}: {
  readonly created: PrincipalCreated;
  readonly onAnother: () => void;
}) {
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="principals.created.title" />
        </Panel.Title>
        <Panel.Description>
          <Message
            id={created.subject_type === 'human' ? 'principals.created.human' : 'principals.created.workload'}
          />
        </Panel.Description>
      </Panel.Header>
      <dl className={styles['created']}>
        <dt>
          <Message id="principals.created.id" />
        </dt>
        <dd>
          <code>{created.principal_id}</code>
        </dd>
      </dl>
      <Panel.Body>
        <Button variant="secondary" icon={<Icon name="users" />} onClick={onAnother}>
          <Message id="principals.create.another" />
        </Button>
      </Panel.Body>
    </Panel.Root>
  );
}

// CreatePrincipalForm creates a Principal. identity-control issues the principal_id and creates the
// Keycloak user; for a person it asks Keycloak to demand a password at first sign-in, so no
// credential passes through here (TDD-identity-control-001).
export function CreatePrincipalForm(): ReactElement {
  const t = useMessage();
  const [open, setOpen] = useState(false);
  const create = useCreatePrincipal();
  const keyFor = useIdempotencyKey();
  const form = useForm<Values>({ defaultValues: empty });
  const subjectType = useWatch({ control: form.control, name: 'subjectType' });

  if (create.isSuccess) {
    return (
      <Created
        created={create.data}
        onAnother={() => {
          create.reset();
          form.reset(empty);
          setOpen(true);
        }}
      />
    );
  }
  if (!open) {
    return (
      <div className={styles['actions']}>
        <Button
          icon={<Icon name="users" />}
          onClick={() => {
            setOpen(true);
          }}
        >
          <Message id="principals.create.open" />
        </Button>
      </div>
    );
  }

  const submit = form.handleSubmit((values) => {
    const request = createRequest(values);
    create.mutate({ request, idempotencyKey: keyFor(request) });
  });

  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="principals.create.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="principals.create.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <SelectField
          {...form.register('subjectType')}
          label={<Message id="principals.create.kind" />}
          options={subjectTypes.map((type) => ({ value: type, label: t(`principals.subject.${type}`) }))}
        />
        <div className={styles['formRow']}>
          <TextField
            {...form.register('username', {
              validate: (value) => value.trim() !== '' || t('principals.create.username.required'),
            })}
            label={<Message id="principals.create.username" />}
            error={form.formState.errors.username?.message}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <TextField
            {...form.register('email')}
            type="email"
            label={<Message id="principals.create.email" />}
            hint={<Message id="principals.create.email.hint" />}
            autoComplete="off"
          />
        </div>
        {subjectType === 'workload' ? (
          <TextField
            {...form.register('workloadOwner', {
              validate: (value, values) =>
                values.subjectType !== 'workload' ||
                isPrincipalId(value) ||
                t('principals.create.owner.invalid'),
            })}
            label={<Message id="principals.create.owner" />}
            hint={<Message id="principals.create.owner.hint" />}
            error={form.formState.errors.workloadOwner?.message}
            autoComplete="off"
            spellCheck={false}
            required
          />
        ) : null}
        {create.isError ? <MutationError error={create.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" disabled={create.isPending} icon={<Icon name="check" />}>
            <Message id="principals.create.submit" />
          </Button>
          <Button
            variant="ghost"
            disabled={create.isPending}
            onClick={() => {
              setOpen(false);
              create.reset();
            }}
          >
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}
