import type { ReactElement, ReactNode } from 'react';
import { FormattedDate } from 'react-intl';

import { Panel } from '@identity-experience/ui';

import { profileLabel } from './labels';
import styles from './Registration.module.scss';
import type { Registration } from '../domain/registration';
import type { CoreMessageKey } from '../i18n/core-messages';
import { CoreMessage } from '../i18n/CoreMessage';

function Field({
  label,
  children,
}: {
  readonly label: CoreMessageKey;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className={styles['field']}>
      <dt>
        <CoreMessage id={label} />
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function List({ values }: { readonly values: readonly string[] }): ReactElement {
  if (values.length === 0) {
    return (
      <span className={styles['quiet']}>
        <CoreMessage id="registration.none" />
      </span>
    );
  }
  return (
    <ul className={styles['values']}>
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

// The Application reference is an authority and an identifier within it (TDD-identity-control-003).
const applicationReference = (registration: Registration): string =>
  [registration.application_authority, registration.application_ref].join(':');

// RegistrationDetails is a registration as desired state records it: the same fields wherever a
// registration is shown, so a provider and an owner read the same record.
export function RegistrationDetails({ registration }: { readonly registration: Registration }): ReactElement {
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <CoreMessage id="registration.details" />
        </Panel.Title>
      </Panel.Header>
      <dl className={styles['fields']}>
        <Field label="registration.field.id">
          <code>{registration.registration_id}</code>
        </Field>
        <Field label="registration.field.realm">
          <code>{registration.realm}</code>
        </Field>
        <Field label="registration.field.profile">
          <CoreMessage id={profileLabel(registration.profile)} />
        </Field>
        <Field label="registration.field.audienceClass">
          <code>{registration.audience_class}</code>
        </Field>
        <Field label="registration.field.application">
          <code>{applicationReference(registration)}</code>
        </Field>
        <Field label="registration.field.algorithm">
          <code>{registration.signing_algorithm}</code>
        </Field>
        <Field label="registration.field.lifetimeClass">
          {registration.lifetime_class === undefined ? (
            <span className={styles['quiet']}>
              <CoreMessage id="registration.none" />
            </span>
          ) : (
            <code>{registration.lifetime_class}</code>
          )}
        </Field>
        <Field label="registration.field.lifespan">
          {registration.access_token_lifespan === undefined ? (
            <CoreMessage id="registrations.lifespan.none" />
          ) : (
            <CoreMessage
              id="registrations.lifespan"
              values={{ seconds: registration.access_token_lifespan }}
            />
          )}
        </Field>
        <Field label="registration.field.audience">
          <List values={registration.audience} />
        </Field>
        <Field label="registration.field.redirects">
          <List values={registration.redirect_uris} />
        </Field>
        <Field label="registration.field.registeredBy">
          <code>{registration.registered_by}</code>
        </Field>
        <Field label="registration.field.created">
          <FormattedDate value={registration.created_at} dateStyle="medium" timeStyle="short" />
        </Field>
        <Field label="registration.field.version">
          <code>{registration.version}</code>
        </Field>
      </dl>
    </Panel.Root>
  );
}
