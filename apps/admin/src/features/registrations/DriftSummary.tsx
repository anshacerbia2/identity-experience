import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { Panel, StatusPill, type StatusTone } from '@identity-experience/ui';

import { ApiErrorPanel } from '@/core/api/ApiErrorPanel';
import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import { needsOperator, type DriftStatus } from '@/domain/registration';

import { useDriftStatus } from './registrations-api';
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
  if (drift.isPending) {
    return <Panel.Root aria-busy="true" className={styles['summary']} />;
  }
  if (drift.isError) {
    return (
      <ApiErrorPanel
        error={drift.error}
        onRetry={() => {
          void drift.refetch();
        }}
      />
    );
  }
  const open = drift.data.findings ?? [];
  const waiting = open.filter(needsOperator).length;
  return (
    <Panel.Root className={styles['summary']}>
      <Panel.Header>
        <Panel.Title>
          <Message id="drift.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="drift.description" />
        </Panel.Description>
      </Panel.Header>
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
      </div>
    </Panel.Root>
  );
}
