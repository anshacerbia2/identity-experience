import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { Button, StatusPill, Table } from '@identity-experience/ui';

import { ApiErrorPanel } from '@/core/api/ApiErrorPanel';
import { Message } from '@/core/i18n/Message';
import { useSession } from '@/core/session/session';
import { SignInRequired } from '@/core/session/SignInRequired';
import {
  openFindingsByRegistration,
  registrationStates,
  type Registration,
  type RegistrationState,
} from '@/domain/registration';

import { DriftSummary } from './DriftSummary';
import { profileLabel, stateLabel, stateTone } from './labels';
import { useDriftStatus, useRegistrationPages } from './registrations-api';
import styles from './RegistrationsPage.module.scss';
import { UnmanagedClients } from './UnmanagedClients';

function StateFilter({ current }: { readonly current: RegistrationState | undefined }): ReactElement {
  const options: readonly (RegistrationState | undefined)[] = [undefined, ...registrationStates];
  return (
    <nav className={styles['filter']} aria-labelledby="registrations-filter-label">
      <span id="registrations-filter-label" className={styles['filterLabel']}>
        <Message id="registrations.filter.label" />
      </span>
      <ul className={styles['filterList']}>
        {options.map((state) => (
          <li key={state ?? 'all'}>
            <Link
              to="/registrations"
              search={state === undefined ? {} : { state }}
              className={styles['filterItem']}
              aria-current={state === current ? 'page' : undefined}
            >
              <Message id={state === undefined ? 'registrations.filter.all' : stateLabel(state)} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Lifespan({ registration }: { readonly registration: Registration }): ReactElement {
  if (registration.access_token_lifespan === undefined) {
    return <Message id="registrations.lifespan.none" />;
  }
  return <Message id="registrations.lifespan" values={{ seconds: registration.access_token_lifespan }} />;
}

function OpenFindings({ count }: { readonly count: number | undefined }): ReactElement {
  if (count === undefined || count === 0) {
    return (
      <span className={styles['quiet']}>
        <Message id="registrations.findings.none" />
      </span>
    );
  }
  return (
    <StatusPill tone="warning">
      <Message id="registrations.findings.count" values={{ count }} />
    </StatusPill>
  );
}

function RegistrationTable({ state }: { readonly state: RegistrationState | undefined }): ReactElement {
  const pages = useRegistrationPages(state);
  const drift = useDriftStatus();
  const open = openFindingsByRegistration(drift.data?.findings ?? null);

  if (pages.isPending) {
    return (
      <p className={styles['quiet']} role="status">
        <Message id="registrations.loading" />
      </p>
    );
  }
  if (pages.isError) {
    return (
      <ApiErrorPanel
        error={pages.error}
        onRetry={() => {
          void pages.refetch();
        }}
      />
    );
  }
  const registrations = pages.data.pages.flatMap((page) => page.registrations);
  if (registrations.length === 0) {
    return (
      <p className={styles['quiet']} role="status">
        <Message id="registrations.empty" />
      </p>
    );
  }
  return (
    <div className={styles['tableBlock']}>
      <Table.Root caption={<Message id="registrations.table.caption" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="registrations.column.client" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="registrations.column.profile" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="registrations.column.audienceClass" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="registrations.column.state" />
            </Table.HeaderCell>
            <Table.HeaderCell align="end">
              <Message id="registrations.column.lifespan" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="registrations.column.findings" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="registrations.column.created" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {registrations.map((registration) => (
            <Table.Row key={registration.registration_id}>
              <Table.Cell mono>
                <Link
                  to="/registrations/$registrationId"
                  params={{ registrationId: registration.registration_id }}
                  className={styles['clientLink']}
                >
                  {registration.client_key}
                </Link>
              </Table.Cell>
              <Table.Cell>
                <Message id={profileLabel(registration.profile)} />
              </Table.Cell>
              <Table.Cell mono>{registration.audience_class}</Table.Cell>
              <Table.Cell>
                <StatusPill tone={stateTone[registration.state]}>
                  <Message id={stateLabel(registration.state)} />
                </StatusPill>
              </Table.Cell>
              <Table.Cell align="end" mono>
                <Lifespan registration={registration} />
              </Table.Cell>
              <Table.Cell>
                <OpenFindings count={open.get(registration.registration_id)} />
              </Table.Cell>
              <Table.Cell>
                <FormattedDate value={registration.created_at} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      {pages.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={pages.isFetchingNextPage}
          onClick={() => {
            void pages.fetchNextPage();
          }}
        >
          <Message id="registrations.loadMore" />
        </Button>
      ) : null}
    </div>
  );
}

// RegistrationsPage lists the realm's protocol clients beside the reconciler's view of them, and the
// Keycloak clients no registration describes. An operator acts on one registration from its own
// page (TDD-identity-experience-003 §Registration Drift Oversight).
export function RegistrationsPage({
  state,
}: {
  readonly state: RegistrationState | undefined;
}): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Message id="registrations.eyebrow" />
        </p>
        <h1 className={styles['title']}>
          <Message id="registrations.title" />
        </h1>
        <p className={styles['lead']}>
          <Message id="registrations.lead" />
        </p>
      </header>
      {session.data?.authenticated === true ? (
        <>
          <DriftSummary />
          <UnmanagedClients />
          <StateFilter current={state} />
          <RegistrationTable state={state} />
        </>
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
