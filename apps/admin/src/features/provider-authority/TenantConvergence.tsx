import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import { ReasonField, reasonRules } from '@identity-experience/app-core/forms';
import { Button, Icon, Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import { useTenantRedrive, useTenantSweep, useUnconverged } from './provider-authority-api';
import styles from './ProviderAuthority.module.scss';

function RedriveForm({
  tenantId,
  onDone,
  onCancel,
}: {
  readonly tenantId: string;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const redrive = useTenantRedrive();
  const form = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    redrive.mutate({ tenantId, reason: values.reason }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="projections.redrive.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="projections.redrive.body" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        <p className={styles['mono']}>{tenantId}</p>
        <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
          <ReasonField
            registration={form.register('reason', reasonRules)}
            error={form.formState.errors.reason}
          />
          {redrive.isError ? <MutationError error={redrive.error} /> : null}
          <div className={styles['actions']}>
            <Button type="submit" disabled={redrive.isPending} icon={<Icon name="pulse" />}>
              <Message id="projections.redrive" />
            </Button>
            <Button variant="ghost" disabled={redrive.isPending} onClick={onCancel}>
              <Message id="form.cancel" />
            </Button>
          </div>
        </form>
      </Panel.Body>
    </Panel.Root>
  );
}

// TenantConvergence is the projection's operator surface (TDD-identity-control-002 2.5.0 §Operator
// Routes; TDD-identity-experience-003 §Tenant Context Convergence): the Tenants whose convergence is
// pending or unresolved, a re-drive of one with a reason, and the scheduled sweep run now. Neither
// command changes the desired state: each schedules convergence, which is level-driven.
export function TenantConvergence(): ReactElement {
  const unconverged = useUnconverged();
  const sweep = useTenantSweep();
  const [redriving, setRedriving] = useState<string | null>(null);
  const [redriven, setRedriven] = useState<string | null>(null);

  let body: ReactElement;
  if (unconverged.isPending) {
    body = <div aria-busy="true" />;
  } else if (unconverged.isError) {
    body = <ApiErrorPanel error={unconverged.error} onRetry={() => void unconverged.refetch()} />;
  } else if (unconverged.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="projections.unconverged.empty" />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id="projections.unconverged.caption" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="projections.column.tenant" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="projections.column.state" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="projections.column.attempts" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="projections.column.marked" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="projections.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {unconverged.data.map((tenant) => (
            <Table.Row key={tenant.tenant_id}>
              <Table.Cell mono>{tenant.tenant_id}</Table.Cell>
              <Table.Cell>
                <StatusPill tone={tenant.state === 'unresolved' ? 'danger' : 'warning'}>
                  <Message id={`projections.state.${tenant.state}`} />
                </StatusPill>
                {tenant.priority ? (
                  <span className={styles['quiet']}>
                    {' '}
                    <Message id="projections.priority" />
                  </span>
                ) : null}
              </Table.Cell>
              <Table.Cell>
                {tenant.attempts}
                {tenant.last_error_class === undefined ? null : (
                  <span className={styles['quiet']}> {tenant.last_error_class}</span>
                )}
              </Table.Cell>
              <Table.Cell>
                <FormattedDate value={tenant.marked_at} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-expanded={redriving === tenant.tenant_id}
                  onClick={() => {
                    setRedriving(tenant.tenant_id);
                    setRedriven(null);
                  }}
                >
                  <Message id="projections.redrive.open" values={{ id: tenant.tenant_id }} />
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }

  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="projections.unconverged.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="projections.unconverged.description" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
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
            <Message id="projections.sweep" />
          </Button>
          {sweep.isSuccess ? (
            <p className={styles['quiet']} role="status">
              <Message
                id={sweep.data.snapshot_read ? 'projections.sweep.done' : 'projections.sweep.noSnapshot'}
                values={{
                  outcome: sweep.data.outcome,
                  rows: sweep.data.snapshot_rows,
                  unknown: sweep.data.unknown_organizations,
                  marked: sweep.data.tenants_marked,
                }}
              />
            </p>
          ) : null}
        </div>
        {sweep.isError ? <MutationError error={sweep.error} /> : null}
        {redriven === null ? null : (
          <p className={styles['success']} role="status">
            <Icon name="check" />
            <Message id="projections.redrive.done" />
          </p>
        )}
        {body}
        {redriving === null ? null : (
          <RedriveForm
            key={redriving}
            tenantId={redriving}
            onDone={() => {
              setRedriven(redriving);
              setRedriving(null);
            }}
            onCancel={() => {
              setRedriving(null);
            }}
          />
        )}
      </Panel.Body>
    </Panel.Root>
  );
}
