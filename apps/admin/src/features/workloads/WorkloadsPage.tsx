import type { ReactElement } from 'react';

import { Message } from '@/core/i18n/Message';
import { useSession } from '@/core/session/session';
import { SignInRequired } from '@/core/session/SignInRequired';

import { CreateWorkloadForm } from './CreateWorkloadForm';
import { WorkloadLookup } from './WorkloadLookup';
import styles from './WorkloadsPage.module.scss';

// WorkloadsPage is what the Identity Control API offers for workloads today
// (TDD-identity-experience-003 §Workloads): creating one, finding one by its principal_id, and
// moving it to a new owner. It lists no workload population.
export function WorkloadsPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Message id="workloads.eyebrow" />
        </p>
        <h1 className={styles['title']}>
          <Message id="workloads.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="workloads.lead" />
        </p>
      </header>
      {session.data?.authenticated === true ? (
        <>
          <CreateWorkloadForm />
          <WorkloadLookup />
        </>
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
