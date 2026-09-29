import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { Button, Icon, Panel, Table } from '@identity-experience/ui';

import { ApiErrorPanel } from '@/core/api/ApiErrorPanel';
import { MutationError } from '@/core/api/MutationError';
import { ReasonField, reasonRules } from '@/core/forms/ReasonField';
import { Message } from '@/core/i18n/Message';
import type { RelinkResult } from '@/domain/principal';

import { useDangling, usePrincipalSweep, useRelink } from './principals-api';
import styles from './PrincipalsPage.module.scss';

function RelinkForm({
  principalId,
  onDone,
  onCancel,
}: {
  readonly principalId: string;
  readonly onDone: (result: RelinkResult) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const relink = useRelink();
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    relink.mutate({ principalId, reason: values.reason }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="principals.relink.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="principals.relink.body" />
        </Panel.Description>
      </Panel.Header>
      <p className={styles['subject']}>
        <code>{principalId}</code>
      </p>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {relink.isError ? <MutationError error={relink.error} /> : null}
        <div className={styles['actions']}>
          <Button type="submit" disabled={relink.isPending} icon={<Icon name="key" />}>
            <Message id="principals.relink" />
          </Button>
          <Button variant="ghost" disabled={relink.isPending} onClick={onCancel}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}

// DanglingSection lists the active Principals whose Keycloak user is gone, and relinks one with a
// reason. The list is bounded by what the sweep found, not by the Principal population: it is a
// finding list, not the directory listing TDD-identity-experience-003 rules out.
export function DanglingSection(): ReactElement {
  const dangling = useDangling();
  const sweep = usePrincipalSweep();
  const [relinking, setRelinking] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RelinkResult | null>(null);

  let body: ReactElement;
  if (dangling.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (dangling.isError) {
    body = (
      <ApiErrorPanel
        error={dangling.error}
        onRetry={() => {
          void dangling.refetch();
        }}
      />
    );
  } else if (dangling.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="principals.dangling.empty" />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id="principals.dangling.caption" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="principals.dangling.column.principal" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.dangling.column.detected" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.dangling.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {dangling.data.map((mapping) => (
            <Table.Row key={mapping.principal_id}>
              <Table.Cell mono>{mapping.principal_id}</Table.Cell>
              <Table.Cell>
                <FormattedDate value={mapping.detected_at} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-expanded={relinking === mapping.principal_id}
                  onClick={() => {
                    setRelinking(mapping.principal_id);
                    setOutcome(null);
                  }}
                >
                  <Message id="principals.relink" />
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }

  return (
    <section className={styles['section']} aria-labelledby="dangling-title">
      <h2 id="dangling-title" className={styles['sectionTitle']}>
        <Message id="principals.dangling.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="principals.dangling.description" />
      </p>
      <div className={styles['actions']}>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="pulse" />}
          disabled={sweep.isPending}
          onClick={() => {
            sweep.mutate();
          }}
        >
          <Message id="principals.sweep" />
        </Button>
        {sweep.isSuccess ? (
          <p className={styles['quiet']} role="status">
            <Message id="principals.sweep.done" values={{ ...sweep.data }} />
          </p>
        ) : null}
      </div>
      {sweep.isError ? <MutationError error={sweep.error} /> : null}
      {outcome === null ? null : (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message
            id={outcome.state === 'active' ? 'principals.relink.active' : 'principals.relink.pending'}
          />
        </p>
      )}
      {body}
      {relinking === null ? null : (
        <RelinkForm
          key={relinking}
          principalId={relinking}
          onDone={(result) => {
            setRelinking(null);
            setOutcome(result);
          }}
          onCancel={() => {
            setRelinking(null);
          }}
        />
      )}
    </section>
  );
}
