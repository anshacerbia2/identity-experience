import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { profileLabel } from './labels';
import styles from './Registration.module.scss';
import type { Registration } from '../domain/registration';
import { CoreMessage } from '../i18n/CoreMessage';
import { Facts, type Fact } from '../shell/Facts';
import { Sheet } from '../shell/Sheet';

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

const none = (
  <span className={styles['quiet']}>
    <CoreMessage id="registration.none" />
  </span>
);

// RegistrationDetails is a registration as desired state records it: the same fields wherever a
// registration is shown, so a provider and an owner read the same record. It is drawn as the record's
// title block, a sheet of cells that share their lines, its version read out on the sheet's bar.
export function RegistrationDetails({ registration }: { readonly registration: Registration }): ReactElement {
  const facts: Fact[] = [
    {
      id: 'id',
      term: <CoreMessage id="registration.field.id" />,
      value: registration.registration_id,
      mono: true,
      wide: true,
    },
    {
      id: 'realm',
      term: <CoreMessage id="registration.field.realm" />,
      value: registration.realm,
      mono: true,
    },
    {
      id: 'profile',
      term: <CoreMessage id="registration.field.profile" />,
      value: <CoreMessage id={profileLabel(registration.profile)} />,
    },
    {
      id: 'audienceClass',
      term: <CoreMessage id="registration.field.audienceClass" />,
      value: registration.audience_class,
      mono: true,
    },
    ...(registration.consent_required === undefined
      ? []
      : [
          {
            id: 'consent',
            term: <CoreMessage id="registration.field.consent" />,
            value: (
              <CoreMessage
                id={registration.consent_required ? 'registration.consent.asks' : 'registration.consent.none'}
              />
            ),
            wide: true,
          },
        ]),
    {
      id: 'application',
      term: <CoreMessage id="registration.field.application" />,
      value: applicationReference(registration),
      mono: true,
    },
    {
      id: 'algorithm',
      term: <CoreMessage id="registration.field.algorithm" />,
      value: registration.signing_algorithm,
      mono: true,
    },
    {
      id: 'lifetimeClass',
      term: <CoreMessage id="registration.field.lifetimeClass" />,
      value: registration.lifetime_class ?? none,
      mono: registration.lifetime_class !== undefined,
    },
    {
      id: 'lifespan',
      term: <CoreMessage id="registration.field.lifespan" />,
      value:
        registration.access_token_lifespan === undefined ? (
          <CoreMessage id="registrations.lifespan.none" />
        ) : (
          <CoreMessage id="registrations.lifespan" values={{ seconds: registration.access_token_lifespan }} />
        ),
    },
    {
      id: 'audience',
      term: <CoreMessage id="registration.field.audience" />,
      value: <List values={registration.audience} />,
    },
    {
      id: 'redirects',
      term: <CoreMessage id="registration.field.redirects" />,
      value: <List values={registration.redirect_uris} />,
      wide: true,
    },
    ...(registration.profile === 'confidential'
      ? [
          {
            id: 'backChannelLogout',
            term: <CoreMessage id="registration.field.backChannelLogout" />,
            value: registration.backchannel_logout_uri ?? (
              <span className={styles['quiet']}>
                <CoreMessage id="registration.backChannelLogout.none" />
              </span>
            ),
            mono: registration.backchannel_logout_uri !== undefined,
            wide: true,
          },
        ]
      : []),
    {
      id: 'registeredBy',
      term: <CoreMessage id="registration.field.registeredBy" />,
      value: registration.registered_by,
      mono: true,
    },
    {
      id: 'created',
      term: <CoreMessage id="registration.field.created" />,
      value: <FormattedDate value={registration.created_at} dateStyle="medium" timeStyle="short" />,
    },
  ];
  return (
    <Sheet
      id="registration-record"
      title={<CoreMessage id="registration.details" />}
      facts={[
        { id: 'version', term: <CoreMessage id="registration.field.version" />, value: registration.version },
      ]}
      flush
    >
      <Facts items={facts} />
    </Sheet>
  );
}
