import { useState, type ReactElement } from 'react';
import { FormattedDate, useIntl } from 'react-intl';

import { ApiErrorPanel, MutationError, useIdempotencyKey } from '@identity-experience/app-core/api';
import { SignInRequired, useSession } from '@identity-experience/app-core/session';
import { Button, Icon, Panel, Table } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';

import { accessEndsBy, useMyConsents, useSelfCommand, type MyConsent, type Operation } from './security-api';
import styles from './SecurityPage.module.scss';

// What one withdrawal came to, with the consent it named and when it was sent: the end of the access
// already issued is counted from then.
interface Withdrawal {
  readonly consent: MyConsent;
  readonly at: number;
  readonly operation: Operation;
}

// Withdrawn says what a withdrawal did, and what it did not (TDD-identity-experience-002 §Consent
// Withdrawal Is Not Revocation): the client gets no new access, and access it already holds lasts until
// the token it holds expires, at most its registered lifetime after the withdrawal.
function Withdrawn({ withdrawal }: { readonly withdrawal: Withdrawal }): ReactElement {
  const intl = useIntl();
  const { consent, operation } = withdrawal;
  switch (operation.state) {
    case 'applied': {
      const endsBy = accessEndsBy(consent, withdrawal.at);
      return (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          {endsBy === null ? (
            <Message id="consents.withdrawn.unbounded" values={{ client: consent.client }} />
          ) : (
            <Message
              id="consents.withdrawn"
              values={{ client: consent.client, time: intl.formatTime(endsBy, { timeStyle: 'short' }) }}
            />
          )}
        </p>
      );
    }
    case 'refused':
      return (
        <p className={styles['quiet']} role="alert">
          <Message id="security.refused" values={{ code: operation.result_code ?? '' }} />
        </p>
      );
    case 'unresolved':
      return (
        <p className={styles['quiet']} role="alert">
          <Message id="security.unresolved" values={{ id: operation.operation_id }} />
        </p>
      );
    default:
      return (
        <p className={styles['quiet']} role="status">
          <Message id="security.running" />
        </p>
      );
  }
}

// lifetimeMinutes is a registered access token lifetime in whole minutes, rounded up, so the page never
// states a shorter bound than the token has.
const lifetimeMinutes = (seconds: number): number => Math.ceil(seconds / 60);

// sentAt is when a withdrawal is sent, read in the event handler that sends it, never during render.
const sentAt = (): number => Date.now();

function Consents(): ReactElement {
  const consents = useMyConsents();
  const mutation = useSelfCommand();
  const keyFor = useIdempotencyKey();
  const t = useMessage();
  const [withdrawal, setWithdrawal] = useState<Withdrawal | null>(null);

  const withdraw = (consent: MyConsent) => {
    const request = { action: 'withdraw' as const, securityRef: consent.security_ref };
    const at = sentAt();
    setWithdrawal(null);
    // One Idempotency-Key per distinct request: a retry of this withdrawal after an outage reuses it,
    // and the API answers with what the first attempt did (STD-GLB-001 §Commands).
    mutation.mutate(
      { ...request, idempotencyKey: keyFor(request) },
      {
        onSuccess: (operation) => {
          setWithdrawal({ consent, at, operation });
        },
      },
    );
  };

  let body: ReactElement;
  if (consents.isPending) {
    body = <div aria-busy="true" />;
  } else if (consents.isError) {
    body = <ApiErrorPanel error={consents.error} onRetry={() => void consents.refetch()} />;
  } else if (consents.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="consents.none" />
      </p>
    );
  } else {
    body = (
      <Table.Root caption={<Message id="consents.title" />} captionHidden>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>
              <Message id="consents.column.client" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="consents.column.scopes" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="consents.column.granted" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="consents.column.lasts" />
            </Table.HeaderCell>
            <Table.HeaderCell>
              <Message id="security.column.action" />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {consents.data.map((consent) => (
            <Table.Row key={consent.security_ref}>
              <Table.Cell mono>{consent.client}</Table.Cell>
              <Table.Cell mono>{consent.scopes.join(', ')}</Table.Cell>
              <Table.Cell>
                <FormattedDate value={consent.granted_at} dateStyle="medium" timeStyle="short" />
              </Table.Cell>
              <Table.Cell>
                {consent.access_token_lifetime_seconds === null ? (
                  <Message id="consents.lasts.unbounded" />
                ) : (
                  <Message
                    id="consents.lasts"
                    values={{ minutes: lifetimeMinutes(consent.access_token_lifetime_seconds) }}
                  />
                )}
              </Table.Cell>
              <Table.Cell>
                <Button
                  variant="secondary"
                  size="small"
                  disabled={mutation.isPending}
                  aria-label={t('consents.withdraw.label', { client: consent.client })}
                  onClick={() => {
                    withdraw(consent);
                  }}
                >
                  <Message id="consents.withdraw" />
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
          <Message id="consents.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="consents.description" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        {body}
        {mutation.isError ? <MutationError error={mutation.error} /> : null}
        {withdrawal === null ? null : <Withdrawn withdrawal={withdrawal} />}
      </Panel.Body>
    </Panel.Root>
  );
}

// ConsentsPage lists the clients a person allowed to act for them, and withdraws a consent
// (TDD-identity-experience-002 1.11.0 §Consents). Only an `external` client asks for consent
// (STD-IAM-002 §3.6), so for most people the list is empty, and the page says why.
export function ConsentsPage(): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <header className={styles['hero']}>
        <p className={styles['eyebrow']}>
          <Message id="security.eyebrow" />
        </p>
        <h1 className={styles['title']}>
          <Message id="consents.pageTitle" />
        </h1>
        <p className={styles['lead']}>
          <Message id="consents.lead" />
        </p>
      </header>
      {session.data?.authenticated === true ? <Consents /> : session.isPending ? null : <SignInRequired />}
    </div>
  );
}
