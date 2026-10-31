import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel, MutationError } from '@identity-experience/app-core/api';
import {
  needsOperator,
  unmanagedClients,
  type DriftStatus,
} from '@identity-experience/app-core/domain/registration';
import { Sheet } from '@identity-experience/app-core/shell';
import { Button, Icon, Panel, StatusPill, type StatusTone } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';

import { useDriftStatus, useRunSweep } from './registrations-api';
import styles from './RegistrationsPage.module.scss';

const outcomes: Readonly<
  Record<'converged' | 'drift' | 'unresolved', { tone: StatusTone; label: MessageKey }>
> = {
  converged: { tone: 'success', label: 'drift.outcome.converged' },
  drift: { tone: 'warning', label: 'drift.outcome.drift' },
  unresolved: { tone: 'danger', label: 'drift.outcome.unresolved' },
};

function LastRun({ status }: { readonly status: DriftStatus }): ReactElement {
  const run = status.last_run;
  if (run === null) {
    return (
      <StatusPill tone="neutral">
        <Message id="drift.noRun" />
      </StatusPill>
    );
  }
  const outcome = run.outcome === undefined ? null : outcomes[run.outcome];
  return (
    <>
      {outcome === null ? (
        <StatusPill tone="info">
          <Message id="drift.running" />
        </StatusPill>
      ) : (
        <StatusPill tone={outcome.tone}>
          <Message id={outcome.label} />
        </StatusPill>
      )}
      <span className={styles['meta']}>
        <span>
          <Message id="drift.lastRun" />
        </span>
        <span>
          <FormattedDate value={run.started_at} dateStyle="medium" timeStyle="medium" />
        </span>
      </span>
    </>
  );
}

// DriftSummary is the reconciler's state at a glance: how the last run ended, how many divergences
// are open, and how many of those wait for an operator because the sweep will not settle them.
export function DriftSummary(): ReactElement {
  const drift = useDriftStatus();
  const sweep = useRunSweep();
  const title = <Message id="drift.title" />;
  const description = <Message id="drift.description" />;
  if (drift.isPending) {
    return (
      <Sheet id="drift" title={title} description={description}>
        <Panel.Root aria-busy="true" className={styles['summary']} />
      </Sheet>
    );
  }
  if (drift.isError) {
    return (
      <Sheet id="drift" title={title} description={description}>
        <ApiErrorPanel
          error={drift.error}
          onRetry={() => {
            void drift.refetch();
          }}
        />
      </Sheet>
    );
  }
  const open = drift.data.findings ?? [];
  const waiting = open.filter(needsOperator).length;
  const unmanaged = unmanagedClients(open);
  return (
    <Sheet id="drift" title={title} description={description}>
      <div className={styles['summaryRow']}>
        <LastRun status={drift.data} />
        <StatusPill tone={open.length === 0 ? 'success' : 'warning'}>
          <Message id="drift.open" values={{ count: open.length }} />
        </StatusPill>
        {waiting === 0 ? null : (
          <StatusPill tone="danger">
            <Message id="drift.needsOperator" values={{ count: waiting }} />
          </StatusPill>
        )}
        {unmanaged === 0 ? null : (
          <StatusPill tone="danger">
            <Message id="drift.unmanaged" values={{ count: unmanaged }} />
          </StatusPill>
        )}
      </div>
      {/* A sweep applies only what it would apply on schedule, so it asks for no reason. */}
      <div className={styles['formActions']}>
        <Button
          variant="secondary"
          size="small"
          disabled={sweep.isPending}
          onClick={() => {
            sweep.mutate();
          }}
        >
          <Icon name="pulse" />
          <Message id="drift.runNow" />
        </Button>
        {sweep.data?.deferred === true ? (
          <p className={styles['quiet']} role="status">
            <Message id="drift.deferred" />
          </p>
        ) : null}
      </div>
      {sweep.isError ? <MutationError error={sweep.error} /> : null}
    </Sheet>
  );
}
