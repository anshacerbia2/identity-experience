import type { ReactElement } from 'react';

import { useSession, SignInRequired } from '@identity-experience/app-core/session';

import { Message } from '@/core/i18n/Message';

import { ApplicationDevelopers } from './ApplicationDevelopers';
import { CreatePrincipalForm } from './CreatePrincipalForm';
import { DanglingSection } from './DanglingSection';
import styles from './PrincipalsPage.module.scss';

// PrincipalsPage is what the Identity Control API offers for Principals today
// (TDD-identity-experience-003 §Principal Provisioning and Portability): creating one, and
// relinking one whose Keycloak user is gone. It lists no Principal population: search and a
// Principal's security state wait for TDD-identity-control-005.
export function PrincipalsPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Message id="principals.eyebrow" />
        </p>
        <h1 className={styles['title']}>
          <Message id="principals.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="principals.lead" />
        </p>
      </header>
      {session.data?.authenticated === true ? (
        <>
          <CreatePrincipalForm />
          <DanglingSection />
          <ApplicationDevelopers />
        </>
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
