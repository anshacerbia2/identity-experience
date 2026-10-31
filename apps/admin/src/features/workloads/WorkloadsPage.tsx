import { useState, type ReactElement } from 'react';

import { useSession, SignInRequired } from '@identity-experience/app-core/session';
import { Block, PageHead } from '@identity-experience/app-core/shell';

import { Message } from '@/core/i18n/Message';

import { CreateWorkloadForm } from './CreateWorkloadForm';
import { EnrolmentCallers } from './EnrolmentCallers';
import { WorkloadConditions } from './WorkloadConditions';
import { WorkloadLookup } from './WorkloadLookup';
import styles from './WorkloadsPage.module.scss';

// WorkloadsPage is what the Identity Control API offers for workloads today
// (TDD-identity-experience-003 §Workloads): creating one, finding one by its principal_id and acting
// on it, the sweep's conditions, and the enrolment callers (1.35.0). It lists no workload
// population: each condition list, and the enrolment callers, is read only when opened.
export function WorkloadsPage(): ReactElement {
  const session = useSession();
  const [lookedUp, setLookedUp] = useState<string | null>(null);
  return (
    <div className={styles['root']}>
      <PageHead
        eyebrow={<Message id="workloads.eyebrow" />}
        title={<Message id="workloads.title" />}
        lead={<Message id="workloads.lead" />}
      />
      {session.data?.authenticated === true ? (
        <>
          <CreateWorkloadForm />
          <WorkloadConditions onOpen={setLookedUp} />
          <WorkloadLookup principalId={lookedUp} onLookup={setLookedUp} />
          <EnrolmentCallers />
        </>
      ) : session.isPending ? null : (
        <Block>
          <SignInRequired />
        </Block>
      )}
    </div>
  );
}
