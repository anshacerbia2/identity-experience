import { useRef, useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { MutationError } from '@identity-experience/app-core/api';
import { Button, Icon, Panel, SelectField, TextAreaField, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';
import { isPrincipalId } from '@/domain/principal';
import {
  createWorkloadRequest,
  isClientKey,
  readPublicKey,
  workloadTypes,
  type Workload,
  type WorkloadType,
} from '@/domain/workload';

import { useCreateWorkload } from './workloads-api';
import styles from './WorkloadsPage.module.scss';

interface Values {
  readonly displayName: string;
  readonly purpose: string;
  readonly workloadType: WorkloadType;
  readonly owner: string;
  readonly teamReference: string;
  readonly clientKey: string;
  readonly applicationRef: string;
  readonly audience: string;
  readonly publicKey: string;
}

const empty: Values = {
  displayName: '',
  purpose: '',
  workloadType: 'service',
  owner: '',
  teamReference: '',
  clientKey: '',
  applicationRef: '',
  audience: '',
  publicKey: '',
};

// useIdempotencyKey keeps one key per distinct request. Resubmitting the same values after an
// outage reuses it, so the API answers with the workload the first attempt created instead of
// creating a second; changing a value is a new request and takes a new key.
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

function Created({ created, onAnother }: { readonly created: Workload; readonly onAnother: () => void }) {
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="workloads.created.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="workloads.created.body" values={{ clientKey: created.client_key }} />
        </Panel.Description>
      </Panel.Header>
      <dl className={styles['created']}>
        <dt>
          <Message id="workloads.created.id" />
        </dt>
        <dd>
          <code>{created.principal_id}</code>
        </dd>
      </dl>
      <Panel.Body>
        <Button variant="secondary" icon={<Icon name="grid" />} onClick={onAnother}>
          <Message id="workloads.create.another" />
        </Button>
      </Panel.Body>
    </Panel.Root>
  );
}

// CreateWorkloadForm creates a workload. identity-control issues the principal_id, creates the
// workload's client holding the public key pasted here, and writes the workload's identity on the
// client's service-account user (TDD-identity-control-004). The workload's team generated the key
// pair and keeps the private key: a private key pasted here is refused before anything is sent.
export function CreateWorkloadForm(): ReactElement {
  const t = useMessage();
  const [open, setOpen] = useState(false);
  const create = useCreateWorkload();
  const keyFor = useIdempotencyKey();
  const form = useForm<Values>({ defaultValues: empty });

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
          icon={<Icon name="grid" />}
          onClick={() => {
            setOpen(true);
          }}
        >
          <Message id="workloads.create.open" />
        </Button>
      </div>
    );
  }

  const submit = form.handleSubmit((values) => {
    const read = readPublicKey(values.publicKey);
    if (!('key' in read)) {
      return;
    }
    const request = createWorkloadRequest({ ...values, publicKey: read.key });
    create.mutate({ request, idempotencyKey: keyFor(request) });
  });

  const required = (key: Parameters<typeof t>[0]) => (value: string) => value.trim() !== '' || t(key);

  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="workloads.create.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="workloads.create.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <div className={styles['formRow']}>
          <TextField
            {...form.register('displayName', { validate: required('workloads.create.displayName.required') })}
            label={<Message id="workloads.create.displayName" />}
            error={form.formState.errors.displayName?.message}
            autoComplete="off"
            required
          />
          <SelectField
            {...form.register('workloadType')}
            label={<Message id="workloads.create.type" />}
            options={workloadTypes.map((type) => ({ value: type, label: t(`workloads.type.${type}`) }))}
          />
        </div>
        <TextAreaField
          {...form.register('purpose', { validate: required('workloads.create.purpose.required') })}
          label={<Message id="workloads.create.purpose" />}
          hint={<Message id="workloads.create.purpose.hint" />}
          error={form.formState.errors.purpose?.message}
          rows={2}
          required
        />
        <div className={styles['formRow']}>
          <TextField
            {...form.register('owner', {
              validate: (value) => isPrincipalId(value) || t('workloads.create.owner.invalid'),
            })}
            label={<Message id="workloads.create.owner" />}
            hint={<Message id="workloads.create.owner.hint" />}
            error={form.formState.errors.owner?.message}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <TextField
            {...form.register('teamReference')}
            label={<Message id="workloads.create.team" />}
            hint={<Message id="workloads.create.team.hint" />}
            autoComplete="off"
          />
        </div>
        <div className={styles['formRow']}>
          <TextField
            {...form.register('clientKey', {
              validate: (value) => isClientKey(value) || t('workloads.create.clientKey.invalid'),
            })}
            label={<Message id="workloads.create.clientKey" />}
            hint={<Message id="workloads.create.clientKey.hint" />}
            error={form.formState.errors.clientKey?.message}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <TextField
            {...form.register('applicationRef', {
              validate: required('workloads.create.application.required'),
            })}
            label={<Message id="workloads.create.application" />}
            hint={<Message id="workloads.create.application.hint" />}
            error={form.formState.errors.applicationRef?.message}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>
        <TextField
          {...form.register('audience')}
          label={<Message id="workloads.create.audience" />}
          hint={<Message id="workloads.create.audience.hint" />}
          autoComplete="off"
          spellCheck={false}
        />
        <TextAreaField
          {...form.register('publicKey', {
            validate: (value) => {
              const read = readPublicKey(value);
              return 'key' in read || t(`publicKey.problem.${read.problem}`);
            },
          })}
          label={<Message id="workloads.create.publicKey" />}
          hint={<Message id="workloads.create.publicKey.hint" />}
          error={form.formState.errors.publicKey?.message}
          rows={5}
          spellCheck={false}
          required
        />
        {create.isError ? <MutationError error={create.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" disabled={create.isPending} icon={<Icon name="check" />}>
            <Message id="workloads.create.submit" />
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
