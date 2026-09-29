import { Link } from '@tanstack/react-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import { FormattedDate } from 'react-intl';

import { Button, Icon, Panel, StatusPill, Table } from '@identity-experience/ui';

import { ApiErrorPanel } from '@/core/api/ApiErrorPanel';
import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';
import { useSession } from '@/core/session/session';
import { SignInRequired } from '@/core/session/SignInRequired';
import {
  convergenceSeconds,
  findingAttention,
  needsOperator,
  type Registration,
} from '@/domain/registration';

import { ApplyDesiredStateForm } from './ApplyDesiredStateForm';
import { DriftExceptions } from './DriftExceptions';
import { attentionTone, fieldLabel, findingClassLabel, profileLabel, stateLabel, stateTone } from './labels';
import { useFindings, useRegistration } from './registrations-api';
import styles from './RegistrationsPage.module.scss';

function Field({
  label,
  children,
}: {
  readonly label: MessageKey;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className={styles['field']}>
      <dt>
        <Message id={label} />
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function List({ values }: { readonly values: readonly string[] }): ReactElement {
  if (values.length === 0) {
    return (
      <span className={styles['quiet']}>
        <Message id="registration.none" />
      </span>
    );
  }
  return (
    <ul className={styles['values']}>
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

// The Application reference is an authority and an identifier within it (TDD-identity-control-003).
const applicationReference = (registration: Registration): string =>
  [registration.application_authority, registration.application_ref].join(':');

function Details({ registration }: { readonly registration: Registration }): ReactElement {
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="registration.details" />
        </Panel.Title>
      </Panel.Header>
      <dl className={styles['fields']}>
        <Field label="registration.field.id">
          <code>{registration.registration_id}</code>
        </Field>
        <Field label="registration.field.realm">
          <code>{registration.realm}</code>
        </Field>
        <Field label="registration.field.profile">
          <Message id={profileLabel(registration.profile)} />
        </Field>
        <Field label="registration.field.audienceClass">
          <code>{registration.audience_class}</code>
        </Field>
        <Field label="registration.field.application">
          <code>{applicationReference(registration)}</code>
        </Field>
        <Field label="registration.field.algorithm">
          <code>{registration.signing_algorithm}</code>
        </Field>
        <Field label="registration.field.lifetimeClass">
          {registration.lifetime_class === undefined ? (
            <span className={styles['quiet']}>
              <Message id="registration.none" />
            </span>
          ) : (
            <code>{registration.lifetime_class}</code>
          )}
        </Field>
        <Field label="registration.field.lifespan">
          {registration.access_token_lifespan === undefined ? (
            <Message id="registrations.lifespan.none" />
          ) : (
            <Message id="registrations.lifespan" values={{ seconds: registration.access_token_lifespan }} />
          )}
        </Field>
        <Field label="registration.field.audience">
          <List values={registration.audience} />
        </Field>
        <Field label="registration.field.redirects">
          <List values={registration.redirect_uris} />
        </Field>
        <Field label="registration.field.registeredBy">
          <code>{registration.registered_by}</code>
        </Field>
        <Field label="registration.field.created">
          <FormattedDate value={registration.created_at} dateStyle="medium" timeStyle="short" />
        </Field>
        <Field label="registration.field.version">
          <code>{registration.version}</code>
        </Field>
      </dl>
    </Panel.Root>
  );
}

const compact = (value: unknown): string =>
  value === null || value === undefined ? '' : JSON.stringify(value);

function Findings({ registrationId }: { readonly registrationId: string }): ReactElement {
  const findings = useFindings(registrationId);
  // The finding whose registered state is being applied, and whether the last one was.
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  if (findings.isPending) {
    return <Panel.Root aria-busy="true" />;
  }
  if (findings.isError) {
    return (
      <ApiErrorPanel
        error={findings.error}
        onRetry={() => {
          void findings.refetch();
        }}
      />
    );
  }
  // The action column exists only when some finding offers an action: the API refuses an apply
  // for any finding that is not open and operator-settled, so no button is offered for one.
  const actionable = findings.data.some(needsOperator);
  const selected = findings.data.find((finding) => finding.finding_id === applying && needsOperator(finding));
  return (
    <section className={styles['section']} aria-labelledby="findings-title">
      <h2 id="findings-title" className={styles['sectionTitle']}>
        <Message id="findings.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="findings.description" />
      </p>
      {applied ? (
        <p className={styles['success']} role="status">
          <Icon name="check" />
          <Message id="findings.apply.done" />
        </p>
      ) : null}
      {findings.data.length === 0 ? (
        <p className={styles['quiet']} role="status">
          <Message id="findings.empty" />
        </p>
      ) : (
        <Table.Root caption={<Message id="findings.caption" />} captionHidden>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>
                <Message id="findings.column.detected" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="findings.column.field" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="findings.column.class" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="findings.column.actor" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="findings.column.convergence" />
              </Table.HeaderCell>
              {actionable ? (
                <Table.HeaderCell>
                  <Message id="findings.column.action" />
                </Table.HeaderCell>
              ) : null}
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {findings.data.map((finding) => {
              const seconds = convergenceSeconds(finding);
              return (
                <Table.Row key={finding.finding_id}>
                  <Table.Cell>
                    <FormattedDate value={finding.detected_at} dateStyle="medium" timeStyle="medium" />
                  </Table.Cell>
                  <Table.Cell>
                    <span className={styles['stack']}>
                      <Message id={fieldLabel(finding.field_class)} />
                      <code className={styles['diff']} title={compact(finding.observed)}>
                        {compact(finding.observed)}
                      </code>
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusPill tone={attentionTone[findingAttention[finding.finding_class]]}>
                      <Message id={findingClassLabel(finding.finding_class)} />
                    </StatusPill>
                  </Table.Cell>
                  <Table.Cell mono>{finding.actor ?? <Message id="findings.unknownActor" />}</Table.Cell>
                  <Table.Cell>
                    {finding.converged_at === null ? (
                      <StatusPill tone="warning">
                        <Message id="findings.open" />
                      </StatusPill>
                    ) : (
                      <span className={styles['stack']}>
                        <FormattedDate value={finding.converged_at} dateStyle="medium" timeStyle="medium" />
                        {seconds === null ? null : (
                          <span className={styles['quiet']}>
                            <Message id="findings.convergedAfter" values={{ seconds }} />
                          </span>
                        )}
                      </span>
                    )}
                  </Table.Cell>
                  {actionable ? (
                    <Table.Cell>
                      {needsOperator(finding) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-expanded={applying === finding.finding_id}
                          onClick={() => {
                            setApplying(finding.finding_id);
                            setApplied(false);
                          }}
                        >
                          <Message id="findings.apply" />
                        </Button>
                      ) : null}
                    </Table.Cell>
                  ) : null}
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      )}
      {selected === undefined ? null : (
        <ApplyDesiredStateForm
          key={selected.finding_id}
          finding={selected}
          onDone={() => {
            setApplying(null);
            setApplied(true);
          }}
          onCancel={() => {
            setApplying(null);
          }}
        />
      )}
    </section>
  );
}

function RegistrationView({ registrationId }: { readonly registrationId: string }): ReactElement {
  const registration = useRegistration(registrationId);
  if (registration.isPending) {
    return <Panel.Root aria-busy="true" />;
  }
  if (registration.isError) {
    return (
      <ApiErrorPanel
        error={registration.error}
        onRetry={() => {
          void registration.refetch();
        }}
      />
    );
  }
  const found = registration.data;
  return (
    <>
      <header className={styles['hero']}>
        <h1 className={styles['title']}>{found.client_key}</h1>
        <StatusPill tone={stateTone[found.state]}>
          <Message id={stateLabel(found.state)} />
        </StatusPill>
      </header>
      <Details registration={found} />
      <Findings registrationId={registrationId} />
      <DriftExceptions registrationId={registrationId} grantable={found.state === 'active'} />
    </>
  );
}

// RegistrationDetailPage is one registration as desired state records it, every divergence the
// reconciler found between it and Keycloak, and the drift exceptions granted for it.
export function RegistrationDetailPage({
  registrationId,
}: {
  readonly registrationId: string;
}): ReactElement {
  const session = useSession();
  return (
    <div className={styles['root']}>
      <Link to="/registrations" className={styles['back']}>
        <Icon name="arrow" />
        <Message id="registration.back" />
      </Link>
      {session.data?.authenticated === true ? (
        <RegistrationView registrationId={registrationId} />
      ) : session.isPending ? null : (
        <SignInRequired />
      )}
    </div>
  );
}
