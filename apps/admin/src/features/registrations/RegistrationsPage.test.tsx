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
  overrides: {
    session?: unknown;
    registrations?: (url: URL) => Response;
    drift?: Response;
    expiring?: Response;
  } = {},
) {
  return stubFetch((url) => {
    if (url.pathname === '/auth/session') {
      return json(overrides.session ?? signedIn);
    }
    if (url.pathname === '/api/v1/registrations:expiring-keys') {
      return overrides.expiring ?? json({ warning_days: 14, critical_days: 3, registrations: [] });
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

  it('lists each open unmanaged client, with whom to ask, and offers no action on it', async () => {
    const disabled: Finding = {
      finding_id: 'f-disabled',
      registration_id: null,
      client_key: 'old-script',
      finding_class: 'unmanaged',
      desired: null,
      observed: { client_id: 'old-script', enabled: false },
      changed_at: null,
      detected_at: '2026-09-29T09:00:30Z',
      converged_at: null,
    };
    const stray: Finding = {
      ...disabled,
      finding_id: 'f-stray',
      client_key: 'console-made',
      observed: { client_id: 'console-made', enabled: true },
      actor: 'kc-user-7',
      changed_at: '2026-09-29T08:59:00Z',
    };
    const gone: Finding = {
      ...stray,
      finding_id: 'f-gone',
      client_key: 'adopted',
      converged_at: '2026-09-29T09:05:00Z',
    };
    const { requests } = api({
      drift: json({ ...drift, findings: [openFinding, stray, disabled, gone] }),
    });
    const { container } = renderApp('/registrations');

    const section = await screen.findByRole('region', { name: 'Unmanaged clients' });
    const table = within(section).getByRole('table', { name: 'Keycloak clients no registration describes' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getByText('console-made')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Enabled')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('kc-user-7')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('old-script')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Disabled')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Unknown')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('No admin event')).toBeInTheDocument();
    expect(within(section).queryByText('adopted')).not.toBeInTheDocument();

    expect(within(section).getByText(/POST \/v1\/registrations:adopt/)).toBeInTheDocument();
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(requests.some((url) => url.pathname.includes(':adopt'))).toBe(false);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows no unmanaged section while none is open', async () => {
    api();
    renderApp('/registrations');
    await screen.findByRole('table', { name: 'Registered clients' });
    expect(screen.queryByRole('region', { name: 'Unmanaged clients' })).not.toBeInTheDocument();
  });

  it('lists the clients whose key is about to expire, most urgent first, and offers nothing', async () => {
    const inTwoDays = new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString();
    const inTenDays = new Date(Date.now() + 10 * 86_400_000 + 3_600_000).toISOString();
    const { requests } = api({
      expiring: json({
        warning_days: 14,
        critical_days: 3,
        registrations: [
          {
            registration_id: 'r-lost',
            client_key: 'lost-job',
            profile: 'workload',
            severity: 'no_key',
            key_id: null,
            expires_at: null,
          },
          {
            registration_id: 'r-bff',
            client_key: 'identity-experience-bff',
            profile: 'confidential',
            severity: 'critical',
            key_id: 'k-1',
            kid: 'laptop',
            expires_at: inTwoDays,
          },
          {
            registration_id: 'r-job',
            client_key: 'nightly-job',
            profile: 'workload',
            severity: 'warning',
            key_id: 'k-2',
            kid: 'job-2026',
            expires_at: inTenDays,
          },
        ],
      }),
    });
    const { container } = renderApp('/registrations');

    const section = await screen.findByRole('region', { name: 'Keys about to expire' });
    const rows = within(
      within(section).getByRole('table', { name: 'Client keys about to expire' }),
    ).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[1] as HTMLElement).getByText('No key: cannot authenticate')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('No accepted key')).toBeInTheDocument();
    expect(
      within(rows[2] as HTMLElement).getByRole('link', { name: 'identity-experience-bff' }),
    ).toHaveAttribute('href', '/registrations/r-bff');
    expect(within(rows[2] as HTMLElement).getByText('Critical')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('in 2 days')).toBeInTheDocument();
    expect(within(rows[3] as HTMLElement).getByText('Warning')).toBeInTheDocument();
    expect(within(rows[3] as HTMLElement).getByText('job-2026')).toBeInTheDocument();
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(requests.every((url) => !url.pathname.includes('/keys'))).toBe(true);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows no expiring keys section while none is reported', async () => {
    api();
    renderApp('/registrations');
    await screen.findByRole('table', { name: 'Registered clients' });
    expect(screen.queryByRole('region', { name: 'Keys about to expire' })).not.toBeInTheDocument();
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
