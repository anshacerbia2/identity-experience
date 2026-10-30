import { useState, type ReactElement } from 'react';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Block, PageHead, Sheet } from '@identity-experience/app-core/shell';
import { Button, Icon } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';

import { useTenantContextReport } from './provider-authority-api';
import styles from './ProviderAuthority.module.scss';
import { TenantConvergence } from './TenantConvergence';

function Report(): ReactElement {
  const t = useMessage();
  const [asked, setAsked] = useState(false);
  const [copied, setCopied] = useState(false);
  const report = useTenantContextReport(asked);

  let body: ReactElement;
  if (!asked) {
    body = (
      <Button
        variant="secondary"
        onClick={() => {
          setAsked(true);
        }}
      >
        <Icon name="arrow" />
        <Message id="projections.read" />
      </Button>
    );
  } else if (report.isPending) {
    body = <div aria-busy="true" />;
  } else if (report.isError) {
    body = <ApiErrorPanel error={report.error} onRetry={() => void report.refetch()} />;
  } else {
    // The report exactly as the API answered it: the mark must be its own, or Organization Control
    // compares it against the wrong position.
    const json = JSON.stringify(report.data, null, 2);
    const label = t('projections.report.json');
    body = (
      <>
        <dl className={styles['details']}>
          <dt>
            <Message id="projections.consumer" />
          </dt>
          <dd className={styles['mono']}>{report.data.consumer_id}</dd>
          <dt>
            <Message id="projections.mark" />
          </dt>
          <dd className={styles['mono']}>{report.data.mark}</dd>
          <dt>
            <Message id="projections.rows" />
          </dt>
          <dd>{(report.data.rows ?? []).length}</dd>
        </dl>
        <div className={styles['actions']}>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              void navigator.clipboard.writeText(json).then(() => {
                setCopied(true);
              });
            }}
          >
            <Message id="projections.copy" />
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={() => {
              setCopied(false);
              void report.refetch();
            }}
          >
            <Message id="projections.again" />
          </Button>
          {copied ? (
            <span className={styles['success']} role="status">
              <Icon name="check" />
              <Message id="projections.copied" />
            </span>
          ) : null}
        </div>
        {
          // The report scrolls when it is long. A region that scrolls must be reachable by keyboard
          // (WCAG 2.1.1), so it takes focus and a name of its own: the sheet is already the region its
          // title names, and two regions of one name are not told apart.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard-focusable
          <pre className={styles['report']} role="region" aria-label={label} tabIndex={0}>
            {json}
          </pre>
        }
      </>
    );
  }
  return (
    <Sheet
      id="tenant-report"
      title={<Message id="projections.report.title" />}
      description={<Message id="projections.report.description" />}
    >
      {body}
    </Sheet>
  );
}

// TenantContextPage serves the Tenant context projection's report (TDD-identity-control-002 §The
// Report an Operator Posts; TDD-identity-experience-003 §Tenant Context Report): the active Memberships
// identity-control holds, at the position it applied. An operator posts it unchanged to Organization
// Control's reconcile route, which is Organization Control's and is not offered here. Above it, the
// Tenants whose convergence is not done, their re-drive and the sweep on request (2.5.0).
export function TenantContextPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <PageHead
        eyebrow={<Message id="projections.eyebrow" />}
        title={<Message id="projections.title" />}
        lead={<Message id="projections.lead" />}
      />
      {session.data?.authenticated === true ? (
        <>
          <TenantConvergence />
          <Report />
        </>
      ) : session.isPending ? null : (
        <Block>
          <SignInRequired />
        </Block>
      )}
    </div>
  );
}
