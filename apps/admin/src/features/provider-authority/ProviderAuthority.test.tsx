import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { json, renderApp, stubFetch } from '@/test/render-app';

// TDD-identity-experience-003 §Emergency Grants and §Tenant Context Report.

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
      return undefined;
    });
    const { container } = renderApp('/projections');
    const read = await screen.findByRole('button', { name: 'Read the report' });
    expect(requests.map((url) => url.pathname)).not.toContain('/api/v1/projections/tenant-context/report');

    await userEvent.click(read);
    const region = await screen.findByRole('region', { name: 'The report an operator posts' });
    expect(JSON.parse(region.textContent)).toEqual(report);
    expect(screen.getByText('4217')).toBeInTheDocument();
    expect(screen.getByText('identity-control')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post|reconcile/i })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});
