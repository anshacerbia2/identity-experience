import type { ReactElement } from 'react';

import { useSession, SignInRequired } from '@identity-experience/app-core/session';

import { Message } from '@/core/i18n/Message';

import { ApplicationDevelopers } from './ApplicationDevelopers';
import { CreatePrincipalForm } from './CreatePrincipalForm';
import { DanglingSection } from './DanglingSection';
import { ParkedOperations } from './ParkedOperations';
import { PrincipalSearch } from './PrincipalSearch';
import styles from './PrincipalsPage.module.scss';
import { UnmappedSection } from './UnmappedSection';

// PrincipalsPage finds a Principal, creates one, relinks one whose Keycloak user is gone, lists the
// kernel users no Principal accounts for, and re-drives a parked security operation
// (TDD-identity-experience-003 §Principal Search and Security State, §Principal Provisioning and
// Portability). It lists no Principal population: the search lists nothing until it is asked, and
// every other list is bounded by what a sweep or the executor found.
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
          <UnmappedSection />
          <ParkedOperations />
          <ApplicationDevelopers />
        </>
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
