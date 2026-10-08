import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import { mayReview, reviewOverdue, type Workload } from '@identity-experience/app-core/domain/workload';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Button, Icon, Panel, StatusPill } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import { workloadTones } from './labels';
import { useReview, useWorkload } from './workloads-api';
import styles from './WorkloadsPage.module.scss';

function When({ value }: { readonly value: string | null | undefined }): ReactElement {
  return value === undefined || value === null ? (
    <Message id="workload.detail.never" />
  ) : (
    <FormattedDate value={value} dateStyle="medium" timeStyle="short" />
  );
}

function Details({ workload }: { readonly workload: Workload }): ReactElement {
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="workload.detail.title" />
        </Panel.Title>
        <Panel.Description>{workload.purpose}</Panel.Description>
      </Panel.Header>
      <Panel.Body>
        <dl className={styles['details']}>
          <dt>
            <Message id="workload.detail.principal" />
          </dt>
          <dd className={styles['mono']}>{workload.principal_id}</dd>
          <dt>
            <Message id="mine.column.client" />
          </dt>
          <dd className={styles['mono']}>{workload.client_key}</dd>
          <dt>
            <Message id="workload.detail.type" />
          </dt>
          <dd>
            <Message id={`workload.type.${workload.workload_type}`} />
          </dd>
          <dt>
            <Message id="workload.detail.team" />
          </dt>
          <dd>{workload.team_reference ?? <Message id="workload.detail.none" />}</dd>
          <dt>
            <Message id="workload.detail.ownerSince" />
          </dt>
          <dd>
            <When value={workload.owner_recorded_at} />
          </dd>
          <dt>
            <Message id="workload.detail.lastSeen" />
          </dt>
          <dd>
            <When value={workload.last_seen_at} />
          </dd>
          <dt>
            <Message id="workload.detail.reviewed" />
          </dt>
          <dd>
            <When value={workload.last_reviewed_at} />
          </dd>
          <dt>
            <Message id="workload.detail.reviewDue" />
          </dt>
          <dd>
            {workload.review_due_at === undefined ? (
              <Message id="workload.detail.none" />
            ) : (
              <>
                <FormattedDate value={workload.review_due_at} dateStyle="medium" />{' '}
                {reviewOverdue(workload, new Date()) ? (
                  <StatusPill tone="danger">
                    <Message id="workloads.overdue" />
                  </StatusPill>
                ) : null}
              </>
            )}
          </dd>
        </dl>
      </Panel.Body>
    </Panel.Root>
  );
}

function ReviewForm({
  workload,
  onDone,
  onCancel,
}: {
  readonly workload: Workload;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const review = useReview(workload.principal_id);
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    review.mutate({ statement: values.reason }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="workload.review.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="workload.review.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {review.isError ? <MutationError error={review.error} /> : null}
        <div className={styles['formActions']}>
          <Button type="submit" disabled={review.isPending} icon={<Icon name="check" />}>
            <Message id="workload.review.submit" />
          </Button>
          <Button variant="ghost" disabled={review.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

// Review offers the owner's periodic review where the API accepts it: the workload's owner, of an
// active workload (TDD-identity-control-004 §Periodic Review). Anything else a workload needs is a
// provider's, and the section says so rather than offering it.
function Review({ workload }: { readonly workload: Workload }): ReactElement {
  const session = useSession();
  const me = session.data?.authenticated === true ? session.data.principalId : null;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const reviewable = mayReview(workload, me);
  return (
    <section className={styles['section']} aria-labelledby="workload-review-title">
      <h2 id="workload-review-title" className={styles['sectionTitle']}>
        <Message id="workload.review.section" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="workload.review.description" />
      </p>
      {done ? (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id="workload.review.done" />
        </p>
      ) : null}
      {!reviewable ? (
        <p className={styles['quiet']}>
          <Message
            id={workload.state === 'active' ? 'workload.review.notOwner' : 'workload.review.inactive'}
          />
        </p>
      ) : open ? (
        <ReviewForm
          workload={workload}
          onDone={() => {
            setOpen(false);
            setDone(true);
          }}
          onCancel={() => {
            setOpen(false);
          }}
        />
      ) : (
        <div className={styles['formActions']}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(true);
              setDone(false);
            }}
          >
            <Message id="workload.review.open" />
          </Button>
        </div>
      )}
      <p className={styles['quiet']}>
        <Icon name="shield" />
        <Message id="workload.provider" />
      </p>
    </section>
  );
}

function WorkloadView({ principalId }: { readonly principalId: string }): ReactElement {
  const workload = useWorkload(principalId);
  if (workload.isPending) {
    return <Panel.Root aria-busy="true" />;
  }
  if (workload.isError) {
    // A workload the person does not own is a 404 from the API, the same as one that does not exist:
    // an owner does not learn which workloads exist.
    return (
      <ApiErrorPanel
        error={workload.error}
        onRetry={() => {
          void workload.refetch();
        }}
      />
    );
  }
  const found = workload.data;
  return (
    <>
      <header className={styles['hero']}>
        <h1 className={styles['title']}>{found.display_name}</h1>
        <StatusPill tone={workloadTones[found.state]}>
          <Message id={`workloads.state.${found.state}`} />
        </StatusPill>
      </header>
      <Details workload={found} />
      <Review workload={found} />
    </>
  );
}

// WorkloadPage is one workload as its owner sees it (ADR-IAM-003 §5.8, TDD-identity-experience-004
// §Ownership): its record, its last review and when the next is due, and the review itself.
export function WorkloadPage({ principalId }: { readonly principalId: string }): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <Link to="/workloads" className={styles['back']}>
        <Icon name="arrow" />
        <Message id="workload.back" />
      </Link>
      {session.data?.authenticated === true ? (
        <WorkloadView principalId={principalId} />
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
