import { useState, type ReactElement } from 'react';

import { useSession, SignInRequired } from '@identity-experience/app-core/session';

import { Message } from '@/core/i18n/Message';

import { CreateWorkloadForm } from './CreateWorkloadForm';
import { WorkloadConditions } from './WorkloadConditions';
import { WorkloadLookup } from './WorkloadLookup';
import styles from './WorkloadsPage.module.scss';

// WorkloadsPage is what the Identity Control API offers for workloads today
// (TDD-identity-experience-003 §Workloads): creating one, finding one by its principal_id and acting
// on it, and the sweep's conditions. It lists no workload population: each condition list is read
// only when opened.
export function WorkloadsPage(): ReactElement {
  const session = useSession();
  const [lookedUp, setLookedUp] = useState<string | null>(null);
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
          <WorkloadConditions onOpen={setLookedUp} />
          <WorkloadLookup principalId={lookedUp} onLookup={setLookedUp} />
        </>
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
