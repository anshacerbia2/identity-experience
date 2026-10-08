import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// The workload sweep's conditions, the sweep itself, and a workload's rebuild and review
// (TDD-identity-experience-003 §Workloads, TDD-identity-control-004 1.5.0).

const csrfToken = 'csrf-from-the-session';
const operator = '01a0da74-44e7-7000-b600-b464c5cb8cec';
const someoneElse = '0192f0e0-5555-7000-8000-000000000001';
const signedIn = {
  authenticated: true,
  principalId: operator,
  displayName: 'Ada Admin',
  acr: '1',
  authTime: null,
  idleExpiresAt: '2026-09-29T10:30:00Z',
  absoluteExpiresAt: '2026-09-29T18:00:00Z',
  csrfToken,
};
const workloadId = '0192f0e0-4444-7000-8000-000000000001';

const workload = (overrides: Record<string, unknown> = {}) => ({
  principal_id: workloadId,
  registration_id: '0192f0e0-6666-7000-8000-000000000001',
  client_key: 'nightly-job',
  display_name: 'Nightly payroll export',
  purpose: 'Exports approved payroll to the bank each night',
  workload_type: 'job',
  owner_principal_id: operator,
  owner_recorded_at: '2026-09-30T08:00:00Z',
  state: 'active',
  orphaned_at: null,
  last_seen_at: null,
  created_by: operator,
  created_at: '2026-09-30T08:00:00Z',
  activated_at: '2026-09-30T08:00:01Z',
  last_reviewed_at: null,
  review_due_at: '2026-12-29T08:00:01Z',
  ...overrides,
});

const orphaned = {
  principal_id: workloadId,
  client_key: 'nightly-job',
  display_name: 'Nightly payroll export',
  owner_principal_id: someoneElse,
  state: 'orphaned',
  since: '2026-10-01T08:00:00Z',
  stage: 'escalated',
};

function api(options: {
  readonly workload?: Record<string, unknown>;
  readonly command?: (sent: Sent) => Response | undefined;
}) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return options.command?.(sent);
    }
    switch (url.pathname) {
      case '/api/v1/workloads:orphaned':
        return json({ workloads: [orphaned] });
      case '/api/v1/workloads:unused':
        return json({ workloads: null });
      case '/api/v1/workloads:reviews-overdue':
        return json({ workloads: [] });
      case `/api/v1/workloads/${workloadId}`:
        return json(options.workload ?? workload());
      default:
        return undefined;
    }
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');
const apiReads = (requests: readonly URL[]): string[] =>
  requests.map((url) => url.pathname).filter((path) => path.startsWith('/api/'));

async function lookUp(): Promise<void> {
  await userEvent.type(await screen.findByRole('textbox', { name: 'principal_id' }), workloadId);
  await userEvent.click(screen.getByRole('button', { name: 'Find' }));
  await screen.findByRole('heading', { name: 'Nightly payroll export' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the workload sweep’s conditions', () => {
  it('reads each list only when it is opened, and opens a row’s workload in the lookup', async () => {
    const { requests } = api({ workload: workload({ state: 'orphaned', owner_principal_id: someoneElse }) });
    const { container } = renderApp('/workloads');
    const section = (await screen.findByRole('heading', { name: 'What the sweep found' })).closest(
      'section',
    ) as HTMLElement;
    expect(apiReads(requests)).toHaveLength(0);

    const orphanedPanel = within(section)
      .getByRole('heading', { name: 'Orphaned' })
      .closest('section') as HTMLElement;
    await userEvent.click(within(orphanedPanel).getByRole('button', { name: 'Show' }));
    const table = await within(orphanedPanel).findByRole('table', {
      name: 'Orphaned workloads, oldest first',
    });
    expect(within(table).getByText('Escalated')).toBeInTheDocument();
    expect(apiReads(requests)).toEqual(['/api/v1/workloads:orphaned']);
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(within(table).getByRole('button', { name: 'Open Nightly payroll export' }));
    expect(await screen.findByRole('heading', { name: 'Nightly payroll export' })).toBeInTheDocument();
    expect(apiReads(requests)).toContain(`/api/v1/workloads/${workloadId}`);
  });

  it('says when a list is empty, a null list included', async () => {
    api({});
    renderApp('/workloads');
    const panel = (await screen.findByRole('heading', { name: 'Unused' })).closest('section') as HTMLElement;
    await userEvent.click(within(panel).getByRole('button', { name: 'Show' }));
    expect(await within(panel).findByText('No workload is unused.')).toBeInTheDocument();
  });

  it('runs the workload sweep and reports its counts', async () => {
    const { sent } = api({
      command: () => json({ orphaned: 1, reclaimed: 0, suspended: 2, unused: 3, reviews_overdue: 4 }),
    });
    renderApp('/workloads');
    await userEvent.click(await screen.findByRole('button', { name: 'Run the workload sweep now' }));
    expect(
      await screen.findByText(
        'Sweep finished: 1 orphaned, 0 reclaimed, 2 suspended, 3 unused, 4 reviews overdue.',
      ),
    ).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/workloads:sweep');
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
  });
});

describe('a workload’s upkeep', () => {
  it('shows when it was last reviewed and when the next review is due', async () => {
    api({ workload: workload({ last_reviewed_at: '2026-10-01T08:00:00Z' }) });
    renderApp('/workloads');
    await lookUp();
    expect(screen.getByText('Last reviewed')).toBeInTheDocument();
    expect(screen.getByText('Next review due')).toBeInTheDocument();
  });

  it('rebuilds the client with a reason, and shows the API’s refusal while the client exists', async () => {
    const { sent } = api({
      command: () =>
        json(
          {
            status: 409,
            detail: "workload: the workload's client still exists; there is nothing to rebuild",
          },
          409,
        ),
    });
    renderApp('/workloads');
    await lookUp();
    await userEvent.click(screen.getByRole('button', { name: 'Rebuild the client' }));
    const panel = (await screen.findByRole('heading', { name: 'Rebuild the workload’s client' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'Client deleted in the console, OPS-90.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Rebuild the client' }));
    expect(
      await within(panel).findByText(
        "The API said: workload: the workload's client still exists; there is nothing to rebuild",
      ),
    ).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe(`/api/v1/workloads/${workloadId}:rebuild`);
    expect(request?.headers['x-administrative-reason']).toBe('Client deleted in the console, OPS-90.');
    expect(request?.headers['idempotency-key']).toBeUndefined();
  });

  it('records the owner’s review, its statement as the reason', async () => {
    const { sent } = api({ command: () => json(workload({ last_reviewed_at: '2026-10-08T08:00:00Z' })) });
    renderApp('/workloads');
    await lookUp();
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    const panel = (await screen.findByRole('heading', { name: 'Review this workload' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'Still exports payroll nightly; owner and team are right.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Record the review' }));
    expect(await screen.findByText('Your review is recorded.')).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe(`/api/v1/workloads/${workloadId}:review`);
    expect(request?.headers['x-administrative-reason']).toBe(
      'Still exports payroll nightly; owner and team are right.',
    );
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
  });

  it('offers the review to the owner alone', async () => {
    api({ workload: workload({ owner_principal_id: someoneElse }) });
    renderApp('/workloads');
    await lookUp();
    expect(screen.getByRole('button', { name: 'Rebuild the client' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('offers neither a rebuild nor a review for a suspended workload', async () => {
    api({ workload: workload({ state: 'suspended' }) });
    renderApp('/workloads');
    await lookUp();
    expect(screen.queryByRole('button', { name: 'Rebuild the client' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Upkeep' })).not.toBeInTheDocument();
  });
});
