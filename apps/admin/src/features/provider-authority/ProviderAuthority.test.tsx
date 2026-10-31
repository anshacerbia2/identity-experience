import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// TDD-identity-experience-003 §Emergency Grants, §Tenant Context Report and §Tenant Context
// Convergence.

const signedIn = {
  authenticated: true,
  principalId: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  displayName: 'Ada Admin',
  acr: '2',
  authTime: null,
  idleExpiresAt: '2026-10-09T10:30:00Z',
  absoluteExpiresAt: '2026-10-09T18:00:00Z',
  csrfToken: 'csrf-from-the-session',
};

const holder = '0192f0e0-3333-7000-8000-000000000007';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EmergencyGrantsPage', () => {
  it('lists each emergency grant with its last use, marks an overdue one, and offers no command', async () => {
    const { requests } = stubFetch((url) => {
      if (url.pathname === '/auth/session') {
        return json(signedIn);
      }
      if (url.pathname === '/api/v1/provider-grants:emergency-validation') {
        return json({
          scope: 'provider:identity-control',
          validation_period_days: 90,
          grants: [
            {
              grant_id: '0192f0e0-cccc-7000-8000-000000000001',
              principal_id: holder,
              held_since: '2026-06-01T08:00:00Z',
              last_used_at: null,
              uses: 0,
              due_at: '2026-08-30T08:00:00Z',
              overdue: true,
            },
            {
              grant_id: '0192f0e0-cccc-7000-8000-000000000002',
              principal_id: '0192f0e0-3333-7000-8000-000000000008',
              held_since: '2026-06-01T08:00:00Z',
              last_used_at: '2026-10-01T08:00:00Z',
              uses: 3,
              due_at: '2026-12-30T08:00:00Z',
              overdue: false,
            },
          ],
        });
      }
      return undefined;
    });
    const { container } = renderApp('/emergency-grants');
    const table = await screen.findByRole('table', { name: 'Emergency grants, the oldest due first' });
    expect(
      screen.getByText(
        'Scope provider:identity-control. A grant unused for 90 days is overdue for validation.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('One grant is overdue.')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: holder })).toHaveAttribute(
      'href',
      `/principals/${holder}`,
    );
    expect(within(table).getByText('Never used')).toBeInTheDocument();
    expect(within(table).getByText('Overdue')).toBeInTheDocument();
    expect(within(table).getByText('In date')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revoke|validate/i })).toBeNull();
    expect(requests.map((url) => url.pathname)).toContain('/api/v1/provider-grants:emergency-validation');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says so when no emergency grant is in force', async () => {
    stubFetch((url) => {
      if (url.pathname === '/auth/session') {
        return json(signedIn);
      }
      if (url.pathname === '/api/v1/provider-grants:emergency-validation') {
        return json({ scope: 'provider:identity-control', validation_period_days: 90, grants: null });
      }
      return undefined;
    });
    renderApp('/emergency-grants');
    expect(await screen.findByText('No emergency grant is in force.')).toBeInTheDocument();
  });
});

describe('TenantContextPage', () => {
  it('reads the report only when asked, and shows it unchanged with its mark', async () => {
    const report = {
      consumer_id: 'identity-control',
      mark: 4217,
      rows: [
        { membership_id: '0192f0e0-dddd-7000-8000-000000000001', membership_version: 7 },
        { membership_id: '0192f0e0-dddd-7000-8000-000000000002', membership_version: 2 },
      ],
    };
    const { requests } = stubFetch((url) => {
      if (url.pathname === '/auth/session') {
        return json(signedIn);
      }
      if (url.pathname === '/api/v1/projections/tenant-context/report') {
        return json(report);
      }
      if (url.pathname === '/api/v1/projections/tenant-context:unconverged') {
        return json({ tenants: [] });
      }
      return undefined;
    });
    const { container } = renderApp('/projections');
    const read = await screen.findByRole('button', { name: 'Read the report' });
    expect(requests.map((url) => url.pathname)).not.toContain('/api/v1/projections/tenant-context/report');

    await userEvent.click(read);
    const region = await screen.findByRole('region', { name: 'The report, as JSON' });
    expect(JSON.parse(region.textContent)).toEqual(report);
    expect(screen.getByText('4217')).toBeInTheDocument();
    expect(screen.getByText('identity-control')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post|reconcile/i })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Tenant context convergence', () => {
  const parked = '0192f0e0-eeee-7000-8000-000000000001';
  const waiting = '0192f0e0-eeee-7000-8000-000000000002';
  const tenants = [
    {
      tenant_id: parked,
      state: 'unresolved',
      priority: true,
      sweep: false,
      attempts: 8,
      last_error_class: 'forbidden',
      marked_at: '2026-10-18T08:00:00Z',
      delivered_at: '2026-10-18T08:00:00Z',
      next_attempt_at: '2026-10-18T08:05:00Z',
    },
    {
      tenant_id: waiting,
      state: 'pending',
      priority: false,
      sweep: true,
      attempts: 0,
      marked_at: '2026-10-18T09:00:00Z',
      delivered_at: null,
      next_attempt_at: '2026-10-18T09:00:00Z',
    },
  ];

  function api(command?: (sent: Sent) => Response | undefined) {
    return stubFetch((url, sent) => {
      if (url.pathname === '/auth/session') {
        return json(signedIn);
      }
      if (sent.method === 'POST') {
        return command?.(sent);
      }
      if (url.pathname === '/api/v1/projections/tenant-context:unconverged') {
        return json({ tenants });
      }
      return undefined;
    });
  }

  const posts = (sent: readonly Sent[]) => sent.filter((request) => request.method === 'POST');

  it('lists the Tenants not converged, a parked one and a priority one said so', async () => {
    api();
    const { container } = renderApp('/projections');
    const table = await screen.findByRole('table', { name: 'Tenants not converged, oldest mark first' });
    expect(within(table).getByText('Parked')).toBeInTheDocument();
    expect(within(table).getByText('Pending')).toBeInTheDocument();
    expect(within(table).getByText('forbidden')).toBeInTheDocument();
    expect(within(table).getByText('A suspension or revocation not yet in the kernel')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('re-drives one Tenant with a reason and the CSRF token, and reads the list again', async () => {
    const { sent, requests } = api(() => json({ tenant_id: parked, state: 'pending' }, 202));
    renderApp('/projections');
    const table = await screen.findByRole('table', { name: 'Tenants not converged, oldest mark first' });
    await userEvent.click(within(table).getByRole('button', { name: `Re-drive ${parked}` }));
    const panel = (await screen.findByRole('heading', { name: 'Re-drive this Tenant' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Reason' }), 'Roles restored, OPS-91.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Re-drive' }));

    expect(await screen.findByText('The Tenant is marked to converge again.')).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe(`/api/v1/projections/tenant-context/tenants/${parked}:redrive`);
    expect(request?.headers['x-administrative-reason']).toBe('Roles restored, OPS-91.');
    expect(request?.headers['x-csrf-token']).toBe('csrf-from-the-session');
    await vi.waitFor(() => {
      expect(
        requests.filter((url) => url.pathname === '/api/v1/projections/tenant-context:unconverged'),
      ).toHaveLength(2);
    });
  });

  it('shows a refused re-drive with the API sentence', async () => {
    api(() => json({ status: 404, detail: 'The desired state holds no such Tenant' }, 404));
    renderApp('/projections');
    const table = await screen.findByRole('table', { name: 'Tenants not converged, oldest mark first' });
    await userEvent.click(within(table).getByRole('button', { name: `Re-drive ${waiting}` }));
    const panel = (await screen.findByRole('heading', { name: 'Re-drive this Tenant' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Reason' }), 'Roles restored, OPS-91.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Re-drive' }));
    expect(
      await within(panel).findByText('The API said: The desired state holds no such Tenant'),
    ).toBeInTheDocument();
  });

  it('runs the sweep now and reports what it did', async () => {
    const { sent } = api(() =>
      json({
        run_id: '0192f0e0-ffff-7000-8000-000000000001',
        outcome: 'drift',
        mark: 4300,
        snapshot_rows: 12,
        snapshot_read: true,
        unknown_organizations: 1,
        tenants_marked: 3,
      }),
    );
    renderApp('/projections');
    await userEvent.click(await screen.findByRole('button', { name: 'Run the Tenant context sweep now' }));
    expect(
      await screen.findByText(
        'Sweep finished, drift found: 12 Memberships read, 1 unknown Organization, 3 Tenants marked.',
      ),
    ).toBeInTheDocument();
    expect(posts(sent)[0]?.url.pathname).toBe('/api/v1/projections/tenant-context:sweep');
  });
});
