import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { ApiErrorPanel } from '@identity-experience/app-core/api';
import { Button, Icon, Panel, StatusPill, Table, TextField } from '@identity-experience/ui';

import { Message, useMessage } from '@/core/i18n/Message';
import { searchable, searchPage } from '@/domain/security';

import { stateTones } from './labels';
import styles from './PrincipalsPage.module.scss';
import { usePrincipalSearch } from './security-api';

// PrincipalSearch finds a Principal by the beginning of its username or email
// (TDD-identity-experience-003 §Search Is Not Listing). It lists nothing until a query is sent, and
// a page holds at most what the API returns: a narrower query finds the rest. Every search is
// recorded upstream, with the query, as a privileged read.
export function PrincipalSearch(): ReactElement {
  const t = useMessage();
  const [query, setQuery] = useState('');
  const results = usePrincipalSearch(query);
  const form = useForm<{ query: string }>({ defaultValues: { query: '' } });
  const submit = form.handleSubmit((values) => {
    setQuery(values.query.trim());
  });

  let body: ReactElement | null = null;
  if (query === '') {
    body = null;
  } else if (results.isPending) {
    body = <Panel.Root aria-busy="true" />;
  } else if (results.isError) {
    body = (
      <ApiErrorPanel
        error={results.error}
        onRetry={() => {
          void results.refetch();
        }}
      />
    );
  } else if (results.data.length === 0) {
    body = (
      <p className={styles['quiet']} role="status">
        <Message id="principals.search.none" values={{ query }} />
      </p>
    );
  } else {
    body = (
      <>
        <Table.Root caption={<Message id="principals.search.caption" />} captionHidden>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>
                <Message id="principals.search.column.username" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.search.column.email" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.search.column.type" />
              </Table.HeaderCell>
              <Table.HeaderCell>
                <Message id="principals.search.column.state" />
              </Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {results.data.map((principal) => (
              <Table.Row key={principal.principal_id}>
                <Table.Cell mono>
                  <Link to="/principals/$principalId" params={{ principalId: principal.principal_id }}>
                    {principal.username}
                  </Link>
                </Table.Cell>
                <Table.Cell>{principal.email ?? ''}</Table.Cell>
                <Table.Cell>
                  <Message id={`principals.subjectType.${principal.subject_type}`} />
                </Table.Cell>
                <Table.Cell>
                  <StatusPill tone={stateTones[principal.state]}>
                    <Message id={`principals.state.${principal.state}`} />
                  </StatusPill>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
        {results.data.length >= searchPage ? (
          <p className={styles['quiet']} role="status">
            <Message id="principals.search.full" values={{ count: searchPage }} />
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section className={styles['section']} aria-labelledby="principal-search-title">
      <h2 id="principal-search-title" className={styles['sectionTitle']}>
        <Message id="principals.search.title" />
      </h2>
      <p className={styles['quiet']}>
        <Message id="principals.search.description" />
      </p>
      <form
        className={styles['searchForm']}
        onSubmit={(event) => void submit(event)}
        role="search"
        noValidate
      >
        <TextField
          {...form.register('query', {
            validate: (value) => searchable(value) || t('principals.search.tooShort'),
          })}
          label={<Message id="principals.search.label" />}
          error={form.formState.errors.query?.message}
          autoComplete="off"
          spellCheck={false}
        />
        <div className={styles['actions']}>
          <Button type="submit" icon={<Icon name="users" />}>
            <Message id="principals.search.submit" />
          </Button>
        </div>
      </form>
      {body}
    </section>
  );
}
