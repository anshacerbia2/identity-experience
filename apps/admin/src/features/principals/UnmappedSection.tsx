import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import { useSession } from '@identity-experience/app-core/session';
import { Sheet } from '@identity-experience/app-core/shell';
import { Button, Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import { adoptable, type UnmappedClass } from '@/domain/principal';

import { AdoptOrphan } from './AdoptOrphan';
import { useUnmapped } from './principals-api';
import styles from './PrincipalsPage.module.scss';

const classLabel: Readonly<Record<UnmappedClass, MessageKey>> = {
  unmapped: 'principals.unmapped.class.unmapped',
  orphan: 'principals.unmapped.class.orphan',
  duplicate: 'principals.unmapped.class.duplicate',
};

// UnmappedSection lists the kernel users no Principal accounts for: the sweep's open unmapped, orphan
// and duplicate findings (TDD-identity-experience-003 §Principal Provisioning and Portability). An
// orphan's identifier is offered for adoption (1.32.0, §Adopting an Orphan's Identifier), unless it is
// the provider's own. Nothing else is offered, because the API has nothing else: such a user came from
// outside the authorized path, and deleting it in the kernel is the triage decision, which the next
// sweep sees.
export function UnmappedSection(): ReactElement {
  const unmapped = useUnmapped();
  const session = useSession();
  const self = session.data?.authenticated === true ? session.data.principalId : null;
  const [adopting, setAdopting] = useState<string | null>(null);

  let body: ReactElement;
  if (unmapped.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (unmapped.isError) {
    body = (
      <ApiErrorPanel
        error={unmapped.error}
        onRetry={() => {
          void unmapped.refetch();
        }}
      />
    );
  } else if (unmapped.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="principals.unmapped.empty" />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id="principals.unmapped.caption" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="principals.unmapped.column.class" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.unmapped.column.username" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.unmapped.column.identifier" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.unmapped.column.user" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.dangling.column.detected" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.unmapped.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {unmapped.data.map((finding) => (
            <Table.Row key={finding.finding_id}>
              <Table.Cell>
                <Message id={classLabel[finding.finding_class]} />
              </Table.Cell>
              <Table.Cell mono>{finding.username ?? ''}</Table.Cell>
              <Table.Cell mono>
                {finding.principal_id === undefined ? (
                  (finding.claimed_principal_id ?? <Message id="principals.unmapped.none" />)
                ) : (
                  <Link to="/principals/$principalId" params={{ principalId: finding.principal_id }}>
                    {finding.principal_id}
                  </Link>
                )}
              </Table.Cell>
              <Table.Cell>
                <StatusPill tone={finding.user_disabled ? 'neutral' : 'warning'}>
                  <Message
                    id={
                      finding.user_disabled ? 'principals.unmapped.disabled' : 'principals.unmapped.enabled'
                    }
                  />
                </StatusPill>
              </Table.Cell>
              <Table.Cell>
                <FormattedDate value={finding.detected_at} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell>
                {adoptable(finding, self) && finding.claimed_principal_id !== undefined ? (
                  <Button
                    variant="secondary"
                    size="small"
                    aria-expanded={adopting === finding.claimed_principal_id}
                    onClick={() => {
                      setAdopting(finding.claimed_principal_id ?? null);
                    }}
                  >
                    <Message id="principals.adopt" />
                  </Button>
                ) : null}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }

  return (
    <Sheet
      id="unmapped"
      title={<Message id="principals.unmapped.title" />}
      description={<Message id="principals.unmapped.description" />}
    >
      {body}
      {adopting === null ? null : (
        <AdoptOrphan
          key={adopting}
          principalId={adopting}
          onClose={() => {
            setAdopting(null);
          }}
        />
      )}
    </Sheet>
  );
}
