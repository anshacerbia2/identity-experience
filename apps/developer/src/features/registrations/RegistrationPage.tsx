import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import {
  ClientKeys,
  LifecycleActions,
  RegistrationChanges,
  RegistrationDetails,
  RegistrationOwners,
  stateLabel,
  stateTone,
  useRegistration,
} from '@identity-experience/app-core/registrations';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Block, PageHead } from '@identity-experience/app-core/shell';
import { Icon, Panel, StatusPill } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import styles from './MyRegistrationsPage.module.scss';

function RegistrationView({
  registrationId,
  back,
}: {
  readonly registrationId: string;
  readonly back: ReactElement;
}): ReactElement {
  const registration = useRegistration(registrationId);
  if (registration.isPending) {
    return (
      <Block>
        {back}
        <Panel.Root aria-busy="true" />
      </Block>
    );
  }
  if (registration.isError) {
    // A registration the person does not own is a 404 from the API, the same as one that does not
    // exist: an owner does not learn which registrations exist.
    return (
      <Block>
        {back}
        <ApiErrorPanel
          error={registration.error}
          onRetry={() => {
            void registration.refetch();
          }}
        />
      </Block>
    );
  }
  const found = registration.data;
  return (
    <>
      <PageHead back={back} eyebrow={<Message id="mine.eyebrow" />} title={found.client_key}>
        <StatusPill tone={stateTone[found.state]}>
          <Message id={stateLabel(found.state)} />
        </StatusPill>
      </PageHead>
      <RegistrationDetails registration={found} />
      <RegistrationChanges registration={found} />
      <ClientKeys registration={found} />
      <LifecycleActions registration={found} owner />
      <RegistrationOwners registrationId={registrationId} />
    </>
  );
}

// RegistrationPage is one registration as its owner acts on it (ADR-IAM-003,
// TDD-identity-experience-004 §Ownership): its record, its redirect URI and audience changes, its
// keys rotated and revoked, its suspension and restoration, and who else owns it. Nothing only a
// provider may do is offered: a change is proposed here and approved in the Admin Portal.
export function RegistrationPage({ registrationId }: { readonly registrationId: string }): ReactElement {
  const session = useSession();
  const back = (
    <Link to="/" className={styles['back']}>
      <Icon name="arrow" />
      <Message id="registration.back" />
    </Link>
  );
  return (
    <div className={styles['root']}>
      {session.data?.authenticated === true ? (
        <RegistrationView registrationId={registrationId} back={back} />
      ) : session.isPending ? null : (
        <Block>
          {back}
          <SignInRequired />
        </Block>
      )}
    </div>
  );
}
