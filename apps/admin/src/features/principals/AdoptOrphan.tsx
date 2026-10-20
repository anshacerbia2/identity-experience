import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { MutationError } from '@identity-experience/app-core/api';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { Button, Icon, Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import { adoptChecks, type AdoptCheckName, type PrincipalAdoption } from '@/domain/principal';

import { useAdopt } from './principals-api';
import styles from './PrincipalsPage.module.scss';

const checkLabel: Readonly<Record<AdoptCheckName, MessageKey>> = {
  orphan_finding: 'principals.adopt.check.orphan_finding',
  one_kernel_user: 'principals.adopt.check.one_kernel_user',
  newer_than_backup: 'principals.adopt.check.newer_than_backup',
  creation_on_record: 'principals.adopt.check.creation_on_record',
};

const known = (check: string): check is AdoptCheckName => (adoptChecks as readonly string[]).includes(check);

function Checks({ plan }: { readonly plan: PrincipalAdoption }): ReactElement {
  return (
    <Table.Root caption={<Message id="principals.adopt.caption" />} captionHidden>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>
            <Message id="principals.adopt.column.check" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="principals.adopt.column.holds" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="principals.adopt.column.detail" />
          </Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {plan.checks.map((check) => (
          <Table.Row key={check.check}>
            <Table.Cell>
              {known(check.check) ? <Message id={checkLabel[check.check]} /> : check.check}
            </Table.Cell>
            <Table.Cell>
              <StatusPill tone={check.holds ? 'success' : 'danger'}>
                <Message id={check.holds ? 'principals.adopt.holds' : 'principals.adopt.fails'} />
              </StatusPill>
            </Table.Cell>
            <Table.Cell>{check.detail}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

// AdoptOrphan re-adopts an orphan's identifier after a restore to an older point (ADR-IAM-001 §5.11
// as amended 2026-10-20; TDD-identity-experience-003 1.32.0 §Adopting an Orphan's Identifier). It plans
// first: the API reads the four checks and changes nothing, and the page shows each with what it read.
// Adopt is offered only on a plan in which every check holds, with the same reason; the API checks
// again, and a refusal then is its 409, shown as its sentence. The mapping lands suspended, and the
// Principal's own page offers the restore.
export function AdoptOrphan({
  principalId,
  onClose,
}: {
  readonly principalId: string;
  readonly onClose: () => void;
}): ReactElement {
  const adopt = useAdopt();
  const [plan, setPlan] = useState<PrincipalAdoption | null>(null);
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });

  const send = (dryRun: boolean) =>
    form.handleSubmit((values) => {
      adopt.mutate(
        { principalId, reason: values.reason, dryRun },
        {
          onSuccess: (answer) => {
            setPlan(answer);
          },
        },
      );
    });

  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="principals.adopt.title" values={{ id: principalId }} />
        </Panel.Title>
        <Panel.Description>
          <Message id="principals.adopt.body" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        {plan?.adopted === true ? (
          <>
            <p className={styles['success']} role="status">
              <Icon name="check" />
              <Message id="principals.adopt.done" />
            </p>
            <div className={styles['actions']}>
              <Link to="/principals/$principalId" params={{ principalId }}>
                <Message id="principals.adopt.open" />
              </Link>
              <Button variant="ghost" onClick={onClose}>
                <Message id="form.cancel" />
              </Button>
            </div>
          </>
        ) : (
          <form
            className={`${styles['form'] ?? ''} ${styles['wideForm'] ?? ''}`}
            onSubmit={(event) => void send(true)(event)}
            noValidate
          >
            <ReasonField
              registration={form.register('reason', {
                ...reasonRules,
                // A changed reason is a new plan: the adoption is sent with the reason its plan was read with.
                onChange: () => {
                  setPlan(null);
                },
              })}
              error={form.formState.errors.reason}
            />
            {plan === null ? null : (
              <>
                <Checks plan={plan} />
                {plan.adoptable ? (
                  <p className={styles['quiet']} role="status">
                    <Message id="principals.adopt.ready" />
                  </p>
                ) : (
                  <p className={styles['quiet']} role="alert">
                    <Message id="principals.adopt.refused" values={{ refusal: plan.refusal ?? '' }} />
                  </p>
                )}
              </>
            )}
            {adopt.isError ? <MutationError error={adopt.error} /> : null}
            <div className={styles['actions']}>
              <Button
                type="submit"
                variant={plan?.adoptable === true ? 'secondary' : 'primary'}
                disabled={adopt.isPending}
              >
                <Message id="principals.adopt.plan" />
              </Button>
              {plan?.adoptable === true ? (
                <Button
                  disabled={adopt.isPending}
                  icon={<Icon name="shield" />}
                  onClick={(event) => void send(false)(event)}
                >
                  <Message id="principals.adopt.apply" />
                </Button>
              ) : null}
              <Button variant="ghost" disabled={adopt.isPending} onClick={onClose}>
                <Message id="form.cancel" />
              </Button>
            </div>
          </form>
        )}
      </Panel.Body>
    </Panel.Root>
  );
}
