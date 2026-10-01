import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import {
  ClientKeys,
  LifecycleActions,
  RegistrationDetails,
  RegistrationOwners,
  stateLabel,
  stateTone,
  useRegistration,
} from '@identity-experience/app-core/registrations';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Icon, Panel, StatusPill } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import styles from './MyRegistrationsPage.module.scss';

function RegistrationView({ registrationId }: { readonly registrationId: string }): ReactElement {
  const registration = useRegistration(registrationId);
  if (registration.isPending) {
    return <Panel.Root aria-busy="true" />;
  }
  if (registration.isError) {
    // A registration the person does not own is a 404 from the API, the same as one that does not
    // exist: an owner does not learn which registrations exist.
    return (
      <ApiErrorPanel
        error={registration.error}
        onRetry={() => {
          void registration.refetch();
        }}
      />
    );
  }
  const found = registration.data;
  return (
    <>
      <header className={styles['hero']}>
        <h1 className={styles['title']}>{found.client_key}</h1>
        <StatusPill tone={stateTone[found.state]}>
          <Message id={stateLabel(found.state)} />
        </StatusPill>
      </header>
      <RegistrationDetails registration={found} />
      <ClientKeys registration={found} />
      <LifecycleActions registration={found} owner />
      <RegistrationOwners registrationId={registrationId} />
    </>
  );
}

// RegistrationPage is one registration as its owner acts on it (ADR-IAM-003,
// TDD-identity-experience-004 §Ownership): its record, its keys rotated and revoked, its suspension
// and restoration, and who else owns it. Nothing only a provider may do is offered.
export function RegistrationPage({ registrationId }: { readonly registrationId: string }): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <Link to="/" className={styles['back']}>
        <Icon name="arrow" />
        <Message id="registration.back" />
      </Link>
      {session.data?.authenticated === true ? (
        <RegistrationView registrationId={registrationId} />
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
