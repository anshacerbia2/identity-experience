import { Link } from '@tanstack/react-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import { Sheet } from '@identity-experience/app-core/shell';
import { Button, Icon, Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';

import { usePending, useQuarantined } from './principals-api';
import styles from './PrincipalsPage.module.scss';

// HeldList is one list of mappings held in a state (TDD-identity-control-001 1.18.0), read only when
// the operator opens it. Each is bounded by what recovery or the reconciler holds, at most 500, so it
// is a finding list and not the Principal listing TDD-identity-experience-003 §Search Is Not Listing
// rules out; it names kernel usernames, so it waits for its button.
function HeldList({
  id,
  title,
  description,
  show,
  open,
  onOpen,
  children,
}: {
  readonly id: string;
  readonly title: MessageKey;
  readonly description: MessageKey;
  readonly show: MessageKey;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Sheet id={id} title={<Message id={title} />} description={<Message id={description} />}>
      {open ? (
        children
      ) : (
        <div className={styles['actions']}>
          <Button variant="secondary" size="small" onClick={onOpen}>
            <Icon name="arrow" />
            <Message id={show} />
          </Button>
        </div>
      )}
    </Sheet>
  );
}

const principalLink = (principalId: string): ReactElement => (
  <Link to="/principals/$principalId" params={{ principalId }}>
    {principalId}
  </Link>
);

// PendingSection lists the mappings recovery has not resolved, oldest first. An overdue one is a
// mapping recovery has had at least one chance to resolve, which the pending-mapping runbook triages.
export function PendingSection(): ReactElement {
  const [open, setOpen] = useState(false);
  const pending = usePending(open);
  let body: ReactElement;
  if (pending.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (pending.isError) {
    body = <ApiErrorPanel error={pending.error} onRetry={() => void pending.refetch()} />;
  } else if (pending.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="principals.pending.empty" />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id="principals.pending.caption" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="principals.detail.principal" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.unmapped.column.username" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.search.column.type" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.detail.created" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.pending.column.recovery" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {pending.data.map((mapping) => (
            <Table.Row key={mapping.principal_id}>
              <Table.Cell mono>{principalLink(mapping.principal_id)}</Table.Cell>
              <Table.Cell mono>{mapping.username}</Table.Cell>
              <Table.Cell>
                <Message id={`principals.subjectType.${mapping.subject_type}`} />
              </Table.Cell>
              <Table.Cell>
                <FormattedDate value={mapping.created_at} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell>
                <StatusPill tone={mapping.overdue ? 'warning' : 'neutral'}>
                  <Message
                    id={mapping.overdue ? 'principals.pending.overdue' : 'principals.pending.waiting'}
                  />
                </StatusPill>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }
  return (
    <HeldList
      id="pending"
      title="principals.pending.title"
      description="principals.pending.description"
      show="principals.pending.show"
      open={open}
      onOpen={() => {
        setOpen(true);
      }}
    >
      {body}
    </HeldList>
  );
}

// QuarantinedSection lists the mappings the reconciler holds, oldest first, each linked to the
// Principal's page, where a quarantined person is released (TDD-identity-experience-003 §Leaving
// Quarantine).
export function QuarantinedSection(): ReactElement {
  const [open, setOpen] = useState(false);
  const quarantined = useQuarantined(open);
  let body: ReactElement;
  if (quarantined.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (quarantined.isError) {
    body = <ApiErrorPanel error={quarantined.error} onRetry={() => void quarantined.refetch()} />;
  } else if (quarantined.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="principals.quarantined.empty" />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id="principals.quarantined.caption" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="principals.detail.principal" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.unmapped.column.username" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.search.column.type" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.detail.quarantined" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="principals.unmapped.column.user" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {quarantined.data.map((mapping) => (
            <Table.Row key={mapping.principal_id}>
              <Table.Cell mono>{principalLink(mapping.principal_id)}</Table.Cell>
              <Table.Cell mono>{mapping.username}</Table.Cell>
              <Table.Cell>
                <Message id={`principals.subjectType.${mapping.subject_type}`} />
              </Table.Cell>
              <Table.Cell>
                {mapping.quarantined_at === null ? null : (
                  <FormattedDate value={mapping.quarantined_at} dateStyle="medium" timeStyle="short" />
                )}
                {mapping.quarantine_reason === '' ? null : (
                  <span className={styles['quiet']}> {mapping.quarantine_reason}</span>
                )}
              </Table.Cell>
              <Table.Cell>
                <Message
                  id={mapping.linked ? 'principals.quarantined.linked' : 'principals.quarantined.unlinked'}
                />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  }
  return (
    <HeldList
      id="quarantined"
      title="principals.quarantined.title"
      description="principals.quarantined.description"
      show="principals.quarantined.show"
      open={open}
      onOpen={() => {
        setOpen(true);
      }}
    >
      {body}
    </HeldList>
  );
}
