import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import type { ChangeDecision, RegistrationChange } from '@identity-experience/app-core/domain/registration';
import { ChangeActions, ChangeCard, useChangeQueue } from '@identity-experience/app-core/registrations';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Icon, Panel } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';

import styles from './ChangeQueuePage.module.scss';
import { RequestQueue } from './RequestQueue';

const dayMs = 24 * 60 * 60 * 1000;

// daysWaited counts whole days a change has waited, against when the queue was read, so every card
// uses the same clock.
const daysWaited = (change: RegistrationChange, readAt: number): number =>
  Math.max(0, Math.floor((readAt - Date.parse(change.proposed_at)) / dayMs));

const outcomes: Readonly<Record<ChangeDecision, MessageKey>> = {
  approve: 'changeQueue.done.approve',
  reject: 'changeQueue.done.reject',
  withdraw: 'changeQueue.done.withdraw',
};

function Queue(): ReactElement {
  const queue = useChangeQueue();
  const [done, setDone] = useState<{ readonly clientKey: string; readonly message: MessageKey } | null>(null);

  if (queue.isPending) {
    return (
      <p className={styles['quiet']} role="status">
        <Message id="changeQueue.loading" />
      </p>
    );
  }
  if (queue.isError) {
    return (
      <ApiErrorPanel
        error={queue.error}
        onRetry={() => {
          void queue.refetch();
        }}
      />
    );
  }
  return (
    <>
      {done === null ? null : (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id={done.message} values={{ clientKey: done.clientKey }} />
        </p>
      )}
      {queue.data.length === 0 ? (
        <Panel.Root>
          <Panel.Header>
            <Panel.Title>
              <Message id="changeQueue.empty" />
            </Panel.Title>
          </Panel.Header>
        </Panel.Root>
      ) : (
        <div className={styles['list']}>
          {queue.data.map((change) => (
            <ChangeCard
              key={change.change_id}
              change={change}
              heading={
                <Link
                  to="/registrations/$registrationId"
                  params={{ registrationId: change.registration_id }}
                  className={styles['clientLink']}
                >
                  {change.client_key}
                </Link>
              }
            >
              <>
                <span className={styles['quiet']}>
                  <Message
                    id="changeQueue.waited"
                    values={{ days: daysWaited(change, queue.dataUpdatedAt) }}
                  />
                </span>
                <ChangeActions
                  change={change}
                  provider
                  onDone={(decision, outcome) => {
                    setDone({
                      clientKey: change.client_key,
                      message:
                        outcome.state === 'superseded' ? 'changeQueue.done.superseded' : outcomes[decision],
                    });
                  }}
                />
              </>
            </ChangeCard>
          ))}
        </div>
      )}
    </>
  );
}

// ChangeQueuePage is what waits for a provider's approval, oldest first: production registration
// requests (ADR-IAM-003 §5.3), and every registration change
// (TDD-identity-experience-003 §Change Approval, ADR-IAM-003 §5.2). Each shows the redirect URIs
// before and after as the API recorded them when it was proposed, and a provider approves or
// rejects a change it did not propose.
export function ChangeQueuePage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Message id="changeQueue.eyebrow" />
        </p>
        <h1 className={styles['title']}>
          <Message id="changeQueue.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="changeQueue.lead" />
        </p>
      </header>
      {session.data?.authenticated === true ? (
        <>
          <RequestQueue />
          <section className={styles['list']} aria-labelledby="change-queue-title">
            <h2 id="change-queue-title" className={styles['sectionTitle']}>
              <Message id="changeQueue.changes.title" />
            </h2>
            <Queue />
          </section>
        </>
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
