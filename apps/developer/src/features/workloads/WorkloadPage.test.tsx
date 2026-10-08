import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { Workload } from '@identity-experience/app-core/domain/workload';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// The workload owner's surface (ADR-IAM-003 §5.8, TDD-identity-experience-004 §Ownership): the
// workloads a person owns with their review dates, one workload's record, and the owner's review,
// sent with its statement and an Idempotency-Key. Nothing a provider alone may do is offered.

const csrfToken = 'csrf-from-the-session';
const me = '11111111-1111-4111-8111-111111111111';
const signedIn = {
  authenticated: true,
  principalId: me,
  displayName: 'Dana Developer',
  acr: 'aal2',
  authTime: '2026-10-01T08:00:00Z',
  idleExpiresAt: '2026-10-01T08:30:00Z',
  absoluteExpiresAt: '2026-10-01T16:00:00Z',
  csrfToken,
};

const id = '77777777-7777-4777-8777-777777777777';

const workload = (overrides: Partial<Workload> = {}): Workload => ({
  principal_id: id,
  registration_id: '88888888-8888-4888-8888-888888888888',
  client_key: 'nightly-export',
  display_name: 'Nightly payroll export',
  purpose: 'Exports approved payroll to the bank each night',
  workload_type: 'job',
  owner_principal_id: me,
  team_reference: 'payroll-platform',
  owner_recorded_at: '2026-07-01T08:00:00Z',
  state: 'active',
  orphaned_at: null,
  last_seen_at: '2026-10-07T23:00:00Z',
  created_by: '33333333-3333-4333-8333-333333333333',
  created_at: '2026-07-01T08:00:00Z',
  activated_at: '2026-07-01T08:00:01Z',
  last_reviewed_at: null,
  review_due_at: '2099-01-01T08:00:01Z',
  ...overrides,
});

function api(found: Workload | Response, command?: (sent: Sent) => Response, mine?: unknown) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === '/api/v1/workloads:mine') {
      return json(mine ?? { workloads: [found] });
    }
    if (url.pathname === `/api/v1/workloads/${id}`) {
      return found instanceof Response ? found : json(found);
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

async function section(name: string): Promise<HTMLElement> {
  return (await screen.findByRole('heading', { name })).closest('section') as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('My workloads', () => {
  it('lists the workloads the person owns, from the owner route, with their review dates', async () => {
    const { requests } = api(workload(), undefined, {
      workloads: [
        workload(),
        workload({
          principal_id: '99999999-9999-4999-8999-999999999999',
          client_key: 'ledger-sync',
          display_name: 'Ledger sync',
          last_reviewed_at: '2026-06-01T08:00:00Z',
          review_due_at: '2026-08-30T08:00:00Z',
        }),
      ],
    });
    const { container } = renderApp('/developer/workloads');

    const table = await screen.findByRole('table', { name: 'Workloads you own' });
    const fresh = within(table).getByRole('row', { name: /Nightly payroll export/ });
    expect(fresh).toHaveTextContent('nightly-export');
    expect(fresh).toHaveTextContent('Active');
    expect(fresh).toHaveTextContent('Never');
    expect(fresh).not.toHaveTextContent('Overdue');
    // A review past its due date is marked, so the owner reviews it first.
    expect(within(table).getByRole('row', { name: /Ledger sync/ })).toHaveTextContent('Overdue');
    expect(within(fresh).getByRole('link', { name: 'Nightly payroll export' })).toHaveAttribute(
      'href',
      `/developer/workloads/${id}`,
    );
    // The provider listings are never asked for: this console is the owner's.
    expect(requests.map((url) => url.pathname)).not.toContain('/api/v1/workloads:reviews-overdue');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says how a workload comes to be owned when the person owns none, an answer of null included', async () => {
    api(workload(), undefined, { workloads: null });
    renderApp('/developer/workloads');

    expect(await screen.findByText('You own no workload')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('is reached from the navigation', async () => {
    api(workload());
    renderApp('/developer/');

    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'My workloads' }));
    expect(await screen.findByRole('table', { name: 'Workloads you own' })).toBeInTheDocument();
  });
});

describe('A workload its owner reviews', () => {
  it('shows the record with its last authentication, last review and next due date', async () => {
    const { requests } = api(workload({ last_reviewed_at: '2026-07-15T08:00:00Z' }));
    const { container } = renderApp(`/developer/workloads/${id}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nightly payroll export' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Exports approved payroll to the bank each night')).toBeInTheDocument();
    for (const [term, value] of [
      ['Client', 'nightly-export'],
      ['Team', 'payroll-platform'],
      ['Last reviewed', 'Jul 15, 2026'],
      ['Next review due', 'Jan 1, 2099'],
    ] as const) {
      expect(screen.getByText(term, { selector: 'dt' }).nextElementSibling).toHaveTextContent(value);
    }
    // The owner's read: the one workload the path names, never a provider listing.
    expect(requests.map((url) => url.pathname)).toContain(`/api/v1/workloads/${id}`);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('records the owner’s review with its statement, the session’s CSRF token and an Idempotency-Key', async () => {
    const { sent } = api(workload(), () => json(workload({ last_reviewed_at: '2026-10-08T08:00:00Z' })));
    renderApp(`/developer/workloads/${id}`);

    const review = await section('Periodic review');
    const user = userEvent.setup();
    await user.click(within(review).getByRole('button', { name: 'Review' }));
    await user.type(
      within(review).getByLabelText(/Reason/),
      'Still exports payroll; purpose, owner and team hold',
    );
    await user.click(within(review).getByRole('button', { name: 'Record the review' }));

    expect(await within(review).findByRole('status')).toHaveTextContent('Your review is recorded.');
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe(`/api/v1/workloads/${id}:review`);
    expect(command?.headers['x-administrative-reason']).toBe(
      'Still exports payroll; purpose, owner and team hold',
    );
    expect(command?.headers['x-csrf-token']).toBe(csrfToken);
    expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('shows the API’s refusal of a review', async () => {
    api(
      workload(),
      () =>
        new Response(
          JSON.stringify({
            title: 'Conflict',
            detail: 'only an active workload is reviewed; this one is suspended',
          }),
          {
            status: 409,
            headers: { 'content-type': 'application/problem+json' },
          },
        ),
    );
    renderApp(`/developer/workloads/${id}`);

    const review = await section('Periodic review');
    const user = userEvent.setup();
    await user.click(within(review).getByRole('button', { name: 'Review' }));
    await user.type(within(review).getByLabelText(/Reason/), 'Still exports payroll each night');
    await user.click(within(review).getByRole('button', { name: 'Record the review' }));

    expect(await within(review).findByRole('alert')).toHaveTextContent('only an active workload is reviewed');
  });

  it('offers no review of a workload that is not active, and never a provider’s action', async () => {
    // A suspended workload has no review due: the API leaves the date out.
    const { review_due_at: _due, ...suspended } = workload({ state: 'suspended' });
    api(suspended);
    renderApp(`/developer/workloads/${id}`);

    const review = await section('Periodic review');
    expect(review).toHaveTextContent('Only an active workload is reviewed.');
    expect(within(review).queryByRole('button')).not.toBeInTheDocument();
    for (const action of ['Suspend', 'Restore', 'Retire', 'Reassign', 'Rebuild the client']) {
      expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument();
    }
  });

  it('offers no review to someone who is not the owner, such as a provider reading it', async () => {
    api(workload({ owner_principal_id: '55555555-5555-4555-8555-555555555555' }));
    renderApp(`/developer/workloads/${id}`);

    const review = await section('Periodic review');
    expect(review).toHaveTextContent('Only the workload’s owner reviews it.');
    expect(within(review).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a workload the person does not own as not found, as the API answers it', async () => {
    api(
      new Response(JSON.stringify({ correlation_id: 'c-404' }), {
        status: 404,
        headers: { 'content-type': 'application/problem+json' },
      }),
    );
    renderApp(`/developer/workloads/${id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing exists at this address.');
    expect(screen.queryByRole('heading', { name: 'Periodic review' })).not.toBeInTheDocument();
  });
});
