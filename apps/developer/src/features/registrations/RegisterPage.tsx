import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { ApiErrorPanel, MutationError, useIdempotencyKey } from '@identity-experience/app-core/api';
import { readPublicKey } from '@identity-experience/app-core/domain/public-key';
import {
  developerClasses,
  developerLifetimeClasses,
  developerProfiles,
  lifetimeMinutes,
  mayRegister,
  mayRequest,
  minProductionOwners,
  ownerLines,
  redirectLines,
  type DeveloperClass,
  type DeveloperLifetimeClass,
  type DeveloperProfile,
  type RegisterRequest,
  type RegistrationRequestRecord,
} from '@identity-experience/app-core/domain/registration';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import {
  profileLabel,
  useProposeRegistration,
  useRegister,
  useStanding,
} from '@identity-experience/app-core/registrations';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Button, Icon, Panel, SelectField, TextAreaField, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';

import styles from './MyRegistrationsPage.module.scss';
import { useMyRegistrations } from './registrations-api';

interface Values {
  readonly clientKey: string;
  readonly applicationRef: string;
  readonly profile: DeveloperProfile;
  readonly audienceClass: DeveloperClass;
  readonly lifetimeClass: DeveloperLifetimeClass | '';
  readonly audience: readonly string[];
  readonly redirectUris: string;
  readonly publicKey: string;
  readonly owners: string;
  readonly reason: string;
}

const empty: Values = {
  clientKey: '',
  applicationRef: '',
  profile: 'confidential',
  audienceClass: 'internal',
  lifetimeClass: '',
  audience: [],
  redirectUris: '',
  publicKey: '',
  owners: '',
  reason: '',
};

// A form registers a client outside production, and requests one in production, where a provider
// other than the person approves it (TDD-identity-experience-004 §Registering a Client).
type Mode = 'register' | 'request';

// request is the registration the form's values describe, with only the fields its profile takes:
// the API refuses a resource with redirect URIs, and a public client with a key.
function request(values: Values): RegisterRequest {
  const base = {
    client_key: values.clientKey.trim(),
    profile: values.profile,
    audience_class: values.audienceClass,
    application_ref: values.applicationRef.trim(),
  };
  if (values.profile === 'resource') {
    return values.lifetimeClass === '' ? base : { ...base, lifetime_class: values.lifetimeClass };
  }
  const client = {
    ...base,
    redirect_uris: redirectLines(values.redirectUris),
    audience: [...values.audience],
  };
  if (values.profile === 'public') {
    return client;
  }
  const read = readPublicKey(values.publicKey);
  return 'key' in read ? { ...client, public_key: read.key } : client;
}

function Requested({ request }: { readonly request: RegistrationRequestRecord }): ReactElement {
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="request.done.title" values={{ clientKey: request.client_key }} />
        </Panel.Title>
        <Panel.Description>
          <Message id="request.done.body" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        <Link to="/" className={styles['clientLink']}>
          <Message id="registration.back" />
        </Link>
      </Panel.Body>
    </Panel.Root>
  );
}

function RegisterForm({ mode, me }: { readonly mode: Mode; readonly me: string | null }): ReactElement {
  const t = useMessage();
  const navigate = useNavigate();
  const create = useRegister();
  const propose = useProposeRegistration();
  const keyFor = useIdempotencyKey();
  const mine = useMyRegistrations();
  const [requested, setRequested] = useState<RegistrationRequestRecord | null>(null);
  const form = useForm<Values>({ defaultValues: { ...empty, owners: me === null ? '' : `${me}\n` } });
  const sending = mode === 'register' ? create : propose;
  const profile = useWatch({ control: form.control, name: 'profile' });
  const resources = (mine.data ?? []).filter(
    (registration) => registration.profile === 'resource' && registration.state !== 'retired',
  );

  const submit = form.handleSubmit((values) => {
    const body = request(values);
    if (mode === 'request') {
      propose.mutate(
        { request: body, owners: ownerLines(values.owners), reason: values.reason },
        { onSuccess: setRequested },
      );
      return;
    }
    create.mutate(
      { request: body, idempotencyKey: keyFor(body) },
      {
        onSuccess: (created) => {
          void navigate({
            to: '/registrations/$registrationId',
            params: { registrationId: created.registration_id },
          });
        },
      },
    );
  });

  if (requested !== null) {
    return <Requested request={requested} />;
  }
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id={mode === 'request' ? 'request.form.title' : 'register.form.title'} />
        </Panel.Title>
        <Panel.Description>
          <Message id={mode === 'request' ? 'request.form.body' : 'register.form.body'} />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          {...form.register('clientKey', {
            validate: (value) => value.trim() !== '' || t('register.clientKey.required'),
          })}
          label={<Message id="register.clientKey" />}
          hint={<Message id="register.clientKey.hint" />}
          error={form.formState.errors.clientKey?.message}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <TextField
          {...form.register('applicationRef', {
            validate: (value) => value.trim() !== '' || t('register.applicationRef.required'),
          })}
          label={<Message id="register.applicationRef" />}
          hint={<Message id="register.applicationRef.hint" />}
          error={form.formState.errors.applicationRef?.message}
          autoComplete="off"
          required
        />
        <SelectField
          {...form.register('profile')}
          label={<Message id="register.profile" />}
          hint={<Message id={`register.profile.${profile}.hint`} />}
          options={developerProfiles.map((value) => ({ value, label: t(profileLabel(value)) }))}
        />
        <SelectField
          {...form.register('audienceClass')}
          label={<Message id="register.audienceClass" />}
          hint={<Message id="register.audienceClass.hint" />}
          options={developerClasses.map((value) => ({ value, label: t(`register.audienceClass.${value}`) }))}
        />
        {profile === 'resource' ? (
          <SelectField
            {...form.register('lifetimeClass', {
              validate: (value) => value !== '' || t('register.lifetimeClass.required'),
            })}
            label={<Message id="register.lifetimeClass" />}
            hint={<Message id="register.lifetimeClass.hint" />}
            error={form.formState.errors.lifetimeClass?.message}
            options={[
              { value: '', label: t('register.lifetimeClass.choose') },
              ...developerLifetimeClasses.map((value) => ({
                value,
                label: t(`register.lifetimeClass.${value}`, lifetimeMinutes[value]),
              })),
            ]}
            required
          />
        ) : (
          <>
            <TextAreaField
              {...form.register('redirectUris', {
                validate: (value) => redirectLines(value).length > 0 || t('changes.propose.empty'),
              })}
              label={<Message id="register.redirectUris" />}
              hint={<Message id="register.redirectUris.hint" />}
              error={form.formState.errors.redirectUris?.message}
              spellCheck={false}
              required
            />
            {resources.length === 0 ? (
              <p className={styles['quiet']}>
                <Message id="register.audience.none" />
              </p>
            ) : (
              <SelectField
                {...form.register('audience')}
                multiple
                label={<Message id="register.audience" />}
                hint={<Message id="register.audience.hint" />}
                options={resources.map((resource) => ({
                  value: resource.client_key,
                  label: resource.client_key,
                }))}
              />
            )}
          </>
        )}
        {profile === 'confidential' ? (
          <TextAreaField
            {...form.register('publicKey', {
              validate: (value) => {
                const read = readPublicKey(value);
                return 'key' in read || t(`publicKey.problem.${read.problem}`);
              },
            })}
            label={<Message id="register.publicKey" />}
            hint={<Message id="keys.rotate.hint" />}
            error={form.formState.errors.publicKey?.message}
            spellCheck={false}
            required
          />
        ) : null}
        {mode === 'request' ? (
          <>
            <TextAreaField
              {...form.register('owners', {
                validate: (value) =>
                  ownerLines(value).length >= minProductionOwners ||
                  t('request.owners.tooFew', { min: minProductionOwners }),
              })}
              label={<Message id="request.owners" />}
              hint={<Message id="request.owners.hint" values={{ min: minProductionOwners }} />}
              error={form.formState.errors.owners?.message}
              spellCheck={false}
              required
            />
            <ReasonField
              registration={form.register('reason', reasonRules)}
              error={form.formState.errors.reason}
            />
          </>
        ) : null}
        {sending.isError ? <MutationError error={sending.error} /> : null}
        <div className={styles['formActions']}>
          <Button type="submit" disabled={sending.isPending} icon={<Icon name="shield" />}>
            <Message id={mode === 'request' ? 'request.submit' : 'register.submit'} />
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void navigate({ to: '/' });
            }}
          >
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

function Gate(): ReactElement {
  const standing = useStanding();
  const session = useSession();
  const me = session.data?.authenticated === true ? session.data.principalId : null;
  if (standing.isPending) {
    return <Panel.Root aria-busy="true" />;
  }
  if (standing.isError) {
    return (
      <ApiErrorPanel
        error={standing.error}
        onRetry={() => {
          void standing.refetch();
        }}
      />
    );
  }
  if (mayRequest(standing.data)) {
    return <RegisterForm mode="request" me={me} />;
  }
  if (!mayRegister(standing.data)) {
    return (
      <Panel.Root>
        <Panel.Header>
          <Panel.Title>
            <Message id="register.unavailable.title" />
          </Panel.Title>
          <Panel.Description>
            <Message id="register.unavailable.standing" />
          </Panel.Description>
        </Panel.Header>
      </Panel.Root>
    );
  }
  return <RegisterForm mode="register" me={me} />;
}

// RegisterPage is a registration by an application developer (ADR-IAM-003 §5.3,
// TDD-identity-experience-004 §Registering a Client): registered at once outside production, and
// requested in production, naming its owners, for a provider other than the person to approve. The
// form offers only what an application developer may register.
export function RegisterPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <Link to="/" className={styles['back']}>
        <Icon name="arrow" />
        <Message id="registration.back" />
      </Link>
      <header className={styles['hero']}>
        <h1 className={styles['title']}>
          <Message id="register.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="register.lead" />
        </p>
      </header>
      {session.data?.authenticated === true ? <Gate /> : session.isPending ? null : <SignInRequired />}
    </div>
  );
}
