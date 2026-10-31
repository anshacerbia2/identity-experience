import { Link } from '@tanstack/react-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Block, PageHead, Sheet } from '@identity-experience/app-core/shell';
import { Button, Icon, Panel, SelectField, StatusPill, Table, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import {
  notIndependent,
  reviewerProblem,
  reviewOutcomes,
  type BootstrapCeremony,
  type NotIndependent,
  type ReviewOutcome,
} from '@/domain/ceremony';

import { useCeremony, useReviewCeremony } from './provider-authority-api';
import styles from './ProviderAuthority.module.scss';

const outcomeLabel: Readonly<Record<ReviewOutcome, MessageKey>> = {
  satisfactory: 'ceremony.outcome.satisfactory',
  findings: 'ceremony.outcome.findings',
};

const notIndependentLabel: Readonly<Record<NotIndependent, MessageKey>> = {
  firstPrincipal: 'ceremony.review.notYou.firstPrincipal',
  operator: 'ceremony.review.notYou.operator',
  witness: 'ceremony.review.notYou.witness',
};

function CeremonyRecord({ ceremony }: { readonly ceremony: BootstrapCeremony }): ReactElement {
  return (
    <Sheet
      id="ceremony-record"
      title={<Message id="ceremony.record.title" />}
      description={<Message id="ceremony.record.description" />}
    >
      <p>
        {ceremony.reviewed ? (
          <StatusPill tone="success">
            <Message id="ceremony.reviewed" values={{ count: ceremony.reviews.length }} />
          </StatusPill>
        ) : (
          <StatusPill tone="warning">
            <Message id="ceremony.unreviewed" />
          </StatusPill>
        )}
      </p>
      <dl className={styles['details']}>
        <dt>
          <Message id="ceremony.field.operator" />
        </dt>
        <dd className={styles['mono']}>{ceremony.operator}</dd>
        <dt>
          <Message id="ceremony.field.witness" />
        </dt>
        <dd className={styles['mono']}>{ceremony.witness}</dd>
        <dt>
          <Message id="ceremony.field.reason" />
        </dt>
        <dd>{ceremony.reason}</dd>
        <dt>
          <Message id="ceremony.field.principal" />
        </dt>
        <dd>
          {ceremony.principal_id === null ? (
            <Message id="ceremony.principal.none" />
          ) : (
            <Link
              to="/principals/$principalId"
              params={{ principalId: ceremony.principal_id }}
              className={styles['link']}
            >
              {ceremony.principal_id}
            </Link>
          )}
        </dd>
        <dt>
          <Message id="ceremony.field.requested" />
        </dt>
        <dd>
          <FormattedDate value={ceremony.requested_at} dateStyle="medium" timeStyle="short" />
        </dd>
      </dl>
    </Sheet>
  );
}

// Reviews is the record's reviews, oldest first, and under them what the signed-in provider may do:
// record a review, or read why they may not.
function Reviews({
  ceremony,
  children,
}: {
  readonly ceremony: BootstrapCeremony;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Sheet
      id="ceremony-reviews"
      title={<Message id="ceremony.reviews.title" />}
      description={<Message id="ceremony.reviews.description" />}
    >
      {ceremony.reviews.length === 0 ? (
        <p className={styles['quiet']} role="status">
          <Message id="ceremony.reviews.none" />
        </p>
      ) : (
        <Table.Root caption={<Message id="ceremony.reviews.caption" />} captionHidden>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>
                <Message id="ceremony.reviews.column.reviewer" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="ceremony.reviews.column.outcome" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="ceremony.reviews.column.statement" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="ceremony.reviews.column.recordedBy" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="ceremony.reviews.column.when" />
              </Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {ceremony.reviews.map((review) => (
              <Table.Row key={review.review_id}>
                <Table.Cell>{review.reviewer}</Table.Cell>
                <Table.Cell>
                  <StatusPill tone={review.outcome === 'satisfactory' ? 'success' : 'warning'}>
                    <Message id={outcomeLabel[review.outcome]} />
                  </StatusPill>
                </Table.Cell>
                <Table.Cell>{review.statement}</Table.Cell>
                <Table.Cell>
                  <Link
                    to="/principals/$principalId"
                    params={{ principalId: review.reviewer_principal_id }}
                    className={styles['link']}
                  >
                    {review.reviewer_principal_id}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <FormattedDate value={review.reviewed_at} dateStyle="medium" timeStyle="short" />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
      {children}
    </Sheet>
  );
}

interface Values {
  readonly reviewer: string;
  readonly outcome: ReviewOutcome;
  readonly statement: string;
}

// RecordReview is offered only to a provider who may review: not the first Principal's holder, and
// not a provider whose name is the operator's or the witness's. The API refuses each with 409 and
// records nothing; this form also refuses a reviewer name that is the operator's or the witness's,
// with the API's comparison, before anything is sent.
function RecordReview({
  ceremony,
  displayName,
}: {
  readonly ceremony: BootstrapCeremony;
  readonly displayName: string | null;
}): ReactElement {
  const t = useMessage();
  const [open, setOpen] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const review = useReviewCeremony();
  const form = useForm<Values>({
    defaultValues: { reviewer: displayName ?? '', outcome: 'satisfactory', statement: '' },
  });

  if (!open) {
    return (
      <div className={styles['actions']}>
        {recorded ? (
          <p className={styles['success']} role="status">
            <Icon name="check" />
            <Message id="ceremony.review.recorded" />
          </p>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => {
            setRecorded(false);
            setOpen(true);
          }}
        >
          <Icon name="check" />
          <Message id="ceremony.review" />
        </Button>
      </div>
    );
  }

  const submit = form.handleSubmit((values) => {
    review.mutate(values, {
      onSuccess: () => {
        setRecorded(true);
        setOpen(false);
        form.reset({ reviewer: displayName ?? '', outcome: 'satisfactory', statement: '' });
      },
    });
  });
  const reviewerMessage: Readonly<Record<'empty' | 'operator' | 'witness', MessageKey>> = {
    empty: 'ceremony.review.reviewer.required',
    operator: 'ceremony.review.reviewer.operator',
    witness: 'ceremony.review.reviewer.witness',
  };
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="ceremony.review.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="ceremony.review.body" />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          {...form.register('reviewer', {
            validate: (value) => {
              const problem = reviewerProblem(ceremony, value);
              return problem === null || t(reviewerMessage[problem]);
            },
          })}
          label={<Message id="ceremony.review.reviewer" />}
          description={<Message id="ceremony.review.reviewer.hint" />}
          error={form.formState.errors.reviewer?.message}
          autoComplete="name"
          required
        />
        <SelectField
          {...form.register('outcome')}
          label={<Message id="ceremony.review.outcome" />}
          options={reviewOutcomes.map((outcome) => ({ value: outcome, label: t(outcomeLabel[outcome]) }))}
        />
        <ReasonField
          registration={form.register('statement', reasonRules)}
          error={form.formState.errors.statement}
        />
        {review.isError ? <MutationError error={review.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" disabled={review.isPending}>
            <Icon name="check" />
            <Message id="ceremony.review.submit" />
          </Button>
          <Button
            variant="ghost"
            disabled={review.isPending}
            onClick={() => {
              setOpen(false);
              review.reset();
            }}
          >
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

function Ceremony(): ReactElement {
  const ceremony = useCeremony();
  const session = useSession();
  if (ceremony.isPending) {
    return (
      <Block>
        <Panel.Root aria-busy="true" />
      </Block>
    );
  }
  if (ceremony.isError) {
    return (
      <Block>
        <ApiErrorPanel error={ceremony.error} onRetry={() => void ceremony.refetch()} />
      </Block>
    );
  }
  if (ceremony.data === null) {
    return (
      <Block>
        <p className={styles['quiet']} role="status">
          <Message id="ceremony.none" />
        </p>
      </Block>
    );
  }
  const signedIn =
    session.data?.authenticated === true
      ? { principalId: session.data.principalId, displayName: session.data.displayName }
      : { principalId: null, displayName: null };
  const excluded = notIndependent(ceremony.data, signedIn);
  return (
    <>
      <CeremonyRecord ceremony={ceremony.data} />
      <Reviews ceremony={ceremony.data}>
        {ceremony.data.principal_id === null ? null : excluded === null ? (
          <RecordReview ceremony={ceremony.data} displayName={signedIn.displayName} />
        ) : (
          <p className={styles['quiet']} role="status">
            <Message id={notIndependentLabel[excluded]} />
          </p>
        )}
      </Reviews>
    </>
  );
}

// CeremonyPage is the bootstrap ceremony's record and its independent reviews
// (TDD-identity-experience-003 1.32.0 §The Bootstrap Ceremony's Review). The record is read-only:
// identity-control's runtime holds no UPDATE or DELETE on it. A review is the one thing recorded here.
export function CeremonyPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <PageHead
        eyebrow={<Message id="ceremony.eyebrow" />}
        title={<Message id="ceremony.title" />}
        lead={<Message id="ceremony.lead" />}
      />
      {session.data?.authenticated === true ? (
        <Ceremony />
      ) : session.isPending ? null : (
        <Block>
          <SignInRequired />
        </Block>
      )}
    </div>
  );
}
