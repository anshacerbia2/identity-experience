import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { DriftStatus, Finding, Registration } from '@/domain/registration';
import { json, renderApp, stubFetch } from '@/test/render-app';

const signedIn = {
  authenticated: true,
  principalId: 'prn_01TEST',
  displayName: 'Ada Admin',
  acr: '1',
  authTime: null,
  idleExpiresAt: '2026-09-29T10:30:00Z',
  absoluteExpiresAt: '2026-09-29T18:00:00Z',
  csrfToken: 'csrf',
};

const registration = (id: string, key: string, overrides: Partial<Registration> = {}): Registration => ({
  registration_id: id,
  realm: 'scnehaux',
  client_key: key,
  profile: 'public',
  audience_class: 'internal',
  application_authority: 'manual',
  application_ref: `app-${key}`,
  registered_by: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  signing_algorithm: 'PS256',
  audience: [],
  redirect_uris: ['https://app.example.com/callback'],
  access_token_lifespan: 240,
  state: 'active',
  version: 2,
  created_at: '2026-09-28T09:00:00Z',
  ...overrides,
});

const openFinding: Finding = {
  finding_id: 'f-open',
  registration_id: 'r-web',
  client_key: 'web',
  field_class: 'redirect_uris',
  finding_class: 'blocked',
  desired: ['https://app.example.com/callback'],
  observed: ['https://evil.example/callback'],
  actor: 'console-admin',
  changed_at: '2026-09-29T09:00:00Z',
  detected_at: '2026-09-29T09:00:30Z',
  converged_at: null,
};

const drift: DriftStatus = {
  last_run: {
    run_id: 'run-1',
    started_at: '2026-09-29T09:00:25Z',
    finished_at: '2026-09-29T09:00:31Z',
    outcome: 'drift',
    attribution: true,
    findings: 1,
  },
  last_run_findings: [openFinding],
  findings: [openFinding],
};

function api(
  overrides: { session?: unknown; registrations?: (url: URL) => Response; drift?: Response } = {},
) {
  return stubFetch((url) => {
    if (url.pathname === '/auth/session') {
      return json(overrides.session ?? signedIn);
    }
    if (url.pathname === '/api/v1/registrations:drift') {
      return overrides.drift ?? json(drift);
    }
    if (url.pathname === '/api/v1/registrations') {
      return (
        overrides.registrations?.(url) ??
        json({
          registrations: [registration('r-web', 'web'), registration('r-orders', 'orders')],
          next: null,
        })
      );
    }
    return undefined;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegistrationsPage', () => {
  it('lists registrations with their state and open findings, beside the drift summary', async () => {
    api();
    const { container } = renderApp('/registrations');

    const table = await screen.findByRole('table', { name: 'Registered clients' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getByRole('link', { name: 'web' })).toHaveAttribute(
      'href',
      '/registrations/r-web',
    );
    expect(within(rows[1] as HTMLElement).getByText('1 open')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('None')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('240 s')).toBeInTheDocument();

    expect(await screen.findByText('Drift found')).toBeInTheDocument();
    expect(screen.getByText('1 open finding')).toBeInTheDocument();
    expect(screen.getByText('1 needs an operator')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('asks for sign-in and reads nothing from the API without a session', async () => {
    const { requests } = api({ session: { authenticated: false } });
    renderApp('/registrations');
    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
    expect(requests.some((url) => url.pathname.startsWith('/api/'))).toBe(false);
  });

  it('loads the next page by the cursor the API returned', async () => {
    const { requests } = api({
      registrations: (url) =>
        url.searchParams.get('after') === 'r-web'
          ? json({ registrations: [registration('r-orders', 'orders')], next: null })
          : json({ registrations: [registration('r-web', 'web')], next: 'r-web' }),
    });
    renderApp('/registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('link', { name: 'orders' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    const pages = requests.filter((url) => url.pathname === '/api/v1/registrations');
    expect(pages.map((url) => url.searchParams.get('after'))).toEqual([null, 'r-web']);
  });

  it('keeps the state filter in the URL and sends it to the API', async () => {
    const { requests } = api({ registrations: () => json({ registrations: [], next: null }) });
    renderApp('/registrations?state=retired');
    expect(await screen.findByText('No registration matches this filter.')).toBeInTheDocument();
    const listed = requests.find((url) => url.pathname === '/api/v1/registrations');
    expect(listed?.searchParams.get('state')).toBe('retired');
    expect(screen.getByRole('link', { name: 'Retired' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Active' })).toHaveAttribute(
      'href',
      '/registrations?state=active',
    );
  });

  it('drops a state the API does not know rather than sending it', async () => {
    const { requests } = api();
    renderApp('/registrations?state=deleted');
    await screen.findByRole('table', { name: 'Registered clients' });
    const listed = requests.filter((url) => url.pathname === '/api/v1/registrations');
    expect(listed.map((url) => url.search)).toEqual(['?limit=50']);
  });

  it('says the API did not answer, with the reference to quote', async () => {
    api({
      registrations: () =>
        json(
          {
            type: 'https://problems.scnehaux.com/dependency-unavailable',
            title: 'A required dependency is unavailable',
            status: 503,
            correlation_id: 'c0ffee00-0000-4000-8000-000000000000',
          },
          503,
        ),
    });
    renderApp('/registrations');
    expect(
      await screen.findByText('The Identity Control API did not answer. Try again in a moment.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Reference: c0ffee00-0000-4000-8000-000000000000')).toBeInTheDocument();
  });

  it('shows the user as signed out when the API reports the session gone', async () => {
    let sessionReads = 0;
    stubFetch((url) => {
      if (url.pathname === '/auth/session') {
        sessionReads += 1;
        return json(sessionReads === 1 ? signedIn : { authenticated: false });
      }
      if (url.pathname.startsWith('/api/')) {
        return json({ status: 401 }, 401);
      }
      return undefined;
    });
    renderApp('/registrations');
    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
    await waitFor(() => {
      expect(sessionReads).toBeGreaterThan(1);
    });
  });
});

describe('RegistrationDetailPage', () => {
  it('shows the registration as recorded and every finding with its outcome', async () => {
    stubFetch((url) => {
      if (url.pathname === '/auth/session') {
        return json(signedIn);
      }
      if (url.pathname === '/api/v1/registrations/r-web') {
        return json(registration('r-web', 'web'));
      }
      if (url.pathname === '/api/v1/registrations/r-web/findings') {
        return json({
          findings: [
            openFinding,
            {
              ...openFinding,
              finding_id: 'f-done',
              field_class: 'token_lifespan',
              finding_class: 'repaired',
              changed_at: '2026-09-29T08:00:00Z',
              converged_at: '2026-09-29T08:00:42Z',
            },
          ],
        });
      }
      return undefined;
    });
    const { container } = renderApp('/registrations/r-web');

    expect(await screen.findByRole('heading', { level: 1, name: 'web' })).toBeInTheDocument();
    expect(screen.getByText('app-web', { exact: false })).toBeInTheDocument();
    const findings = await screen.findByRole('table', { name: 'Findings for this client' });
    expect(within(findings).getByText('Blocked')).toBeInTheDocument();
    expect(within(findings).getByText('Open')).toBeInTheDocument();
    expect(within(findings).getByText('Repaired')).toBeInTheDocument();
    expect(within(findings).getByText('after 42 s')).toBeInTheDocument();
    expect(within(findings).getAllByText('console-admin', { selector: 'td' })).toHaveLength(2);

    expect(await axe(container)).toHaveNoViolations();
  });
});
