import type { ReactElement } from 'react';

import { useSession, SignInRequired } from '@identity-experience/app-core/session';

import { Message } from '@/core/i18n/Message';

import { ApplicationDevelopers } from './ApplicationDevelopers';
import { CreatePrincipalForm } from './CreatePrincipalForm';
import { DanglingSection } from './DanglingSection';
import { PrincipalSearch } from './PrincipalSearch';
import styles from './PrincipalsPage.module.scss';

// PrincipalsPage finds a Principal, creates one, and relinks one whose Keycloak user is gone
// (TDD-identity-experience-003 §Principal Search and Security State, §Principal Provisioning and
// Portability). It lists no Principal population: the search lists nothing until it is asked.
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
          <PrincipalSearch />
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
