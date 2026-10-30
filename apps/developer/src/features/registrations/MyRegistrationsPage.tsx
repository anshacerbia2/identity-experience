import { Link, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { FormattedDate } from 'react-intl';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import { mayRegister, mayRequest, type Standing } from '@identity-experience/app-core/domain/registration';
import {
  profileLabel,
  stateLabel,
  stateTone,
  useStanding,
} from '@identity-experience/app-core/registrations';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Block, PageHead, Sheet } from '@identity-experience/app-core/shell';
import { Button, Icon, Panel, StatusPill, Table } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import styles from './MyRegistrationsPage.module.scss';
import { MyRequests } from './MyRequests';
import { useMyRegistrations } from './registrations-api';

type Offer = 'register' | 'request';

// offerFor is the registration the API accepts from the person, if any, offered only to an
// application developer: registered outside production, requested in production
// (TDD-identity-experience-004 §Registering a Client).
function offerFor(standing: Standing | undefined): Offer | undefined {
  if (standing === undefined || !standing.application_developer) {
    return undefined;
  }
  if (mayRequest(standing)) {
    return 'request';
  }
  return mayRegister(standing) ? 'register' : undefined;
}

function Head({ offer }: { readonly offer?: Offer | undefined }): ReactElement {
  const navigate = useNavigate();
  return (
    <PageHead
      eyebrow={<Message id="mine.eyebrow" />}
      title={<Message id="mine.title" />}
      lead={<Message id="mine.lead" />}
    >
      {offer === undefined ? undefined : (
        <Button
          onClick={() => {
            void navigate({ to: '/registrations/new' });
          }}
        >
          <Icon name="shield" />
          <Message id={offer === 'request' ? 'request.open' : 'register.open'} />
        </Button>
      )}
    </PageHead>
  );
}

// OwnerView is the page for a signed-in person: the head offering what the person may register, the
// person's requests when a registration is requested, and the registrations the person owns.
function OwnerView(): ReactElement {
  const offer = offerFor(useStanding().data);
  return (
    <>
      <Head offer={offer} />
      {offer === 'request' ? <MyRequests /> : null}
      <MyRegistrations />
    </>
  );
}

function MyRegistrations(): ReactElement {
  return (
    <Sheet id="mine" title={<Message id="mine.list.title" />}>
      <Registrations />
    </Sheet>
  );
}

function Registrations(): ReactElement {
  const mine = useMyRegistrations();

  if (mine.isPending) {
    return (
      <p className={styles['quiet']} role="status">
        <Message id="mine.loading" />
      </p>
    );
  }
  if (mine.isError) {
    return (
      <ApiErrorPanel
        error={mine.error}
        onRetry={() => {
          void mine.refetch();
        }}
      />
    );
  }
  if (mine.data.length === 0) {
    return (
      <Panel.Root>
        <Panel.Header>
          <Panel.Title>
            <Message id="mine.empty.title" />
          </Panel.Title>
          <Panel.Description>
            <Message id="mine.empty.body" />
          </Panel.Description>
        </Panel.Header>
      </Panel.Root>
    );
  }
  return (
    <Table.Root caption={<Message id="mine.table.caption" />} captionHidden>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>
            <Message id="mine.column.client" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="mine.column.profile" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="mine.column.state" />
          </Table.HeaderCell>
          <Table.HeaderCell>
            <Message id="mine.column.created" />
          </Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {mine.data.map((registration) => (
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
            <Table.Cell>
              <StatusPill tone={stateTone[registration.state]}>
                <Message id={stateLabel(registration.state)} />
              </StatusPill>
            </Table.Cell>
            <Table.Cell>
              <FormattedDate value={registration.created_at} dateStyle="medium" timeStyle="short" />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

// MyRegistrationsPage lists the registrations the signed-in person owns (ADR-IAM-003,
// TDD-identity-experience-004 §Ownership). It shows what the Identity Control API answers for the
// owner and decides nothing: which registrations a person owns is the API's record, not this page's.
export function MyRegistrationsPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      {session.data?.authenticated === true ? (
        <OwnerView />
      ) : (
        <>
          <Head />
          {session.isPending ? null : (
            <Block>
              <SignInRequired />
            </Block>
          )}
        </>
      )}
    </div>
  );
}
