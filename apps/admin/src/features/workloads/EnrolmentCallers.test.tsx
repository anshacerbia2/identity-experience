import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// The enrolment callers on the Workloads page (TDD-identity-experience-003 1.35.0 §Enrolment Callers):
// every transition of identity-control's caller record has an action here.

const csrfToken = 'csrf-from-the-session';
const signedIn = {
  authenticated: true,
  principalId: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  displayName: 'Ada Admin',
  acr: '1',
  authTime: null,
  idleExpiresAt: '2026-09-29T10:30:00Z',
  absoluteExpiresAt: '2026-09-29T18:00:00Z',
  csrfToken,
};
const bffWorkload = '0192f0e0-7777-7000-8000-000000000001';
const retiredWorkload = '0192f0e0-8888-7000-8000-000000000001';

const active = {
  principal_id: bffWorkload,
  purpose: 'The enrolment BFF of ada-laptop',
  registered_by: signedIn.principalId,
  register_reason: 'Wiring the enrolment page on ada-laptop',
  registered_at: '2026-10-21T08:00:00Z',
  retired_by: null,
  retire_reason: null,
  retired_at: null,
};
const retired = {
  ...active,
  principal_id: retiredWorkload,
  retired_by: signedIn.principalId,
  retire_reason: 'The old laptop was replaced',
  retired_at: '2026-10-21T09:00:00Z',
};

function api(command?: (sent: Sent) => Response | undefined) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === '/api/v1/enrolment-callers') {
      return json({ enrolment_callers: [retired, active] });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EnrolmentCallers', () => {
  it('reads the record only when it is opened, and lists active and retired callers', async () => {
    const { requests } = api();
    const { container } = renderApp('/workloads');
    const open = await screen.findByRole('button', { name: 'Show the enrolment callers' });
    expect(requests.filter((url) => url.pathname === '/api/v1/enrolment-callers')).toHaveLength(0);

    await userEvent.click(open);
    expect(await screen.findByText(bffWorkload)).toBeInTheDocument();
    expect(screen.getByText(retiredWorkload)).toBeInTheDocument();
    expect(screen.getByText('The old laptop was replaced')).toBeInTheDocument();
    // Only the active caller can be retired.
    expect(screen.getByRole('button', { name: `Retire ${bffWorkload}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Retire ${retiredWorkload}` })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('registers a caller with its purpose, a reason, an Idempotency-Key and the CSRF token', async () => {
    const { sent } = api(() => json(active, 201));
    renderApp('/workloads');
    await userEvent.click(await screen.findByRole('button', { name: 'Register a caller' }));
    const panel = screen.getByRole('button', { name: 'Register' }).closest('form') as HTMLElement;
    await userEvent.type(within(panel).getByRole('textbox', { name: 'principal_id' }), bffWorkload);
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Purpose' }),
      'The enrolment BFF of ada-laptop',
    );
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'Wiring the enrolment page on ada-laptop',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('The enrolment caller is registered.')).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/enrolment-callers');
    expect(request?.body).toEqual({ principal_id: bffWorkload, purpose: 'The enrolment BFF of ada-laptop' });
    expect(request?.headers['x-administrative-reason']).toBe('Wiring the enrolment page on ada-laptop');
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses an identifier that is not a UUID without sending it', async () => {
    const { sent } = api(() => json(active, 201));
    renderApp('/workloads');
    await userEvent.click(await screen.findByRole('button', { name: 'Register a caller' }));
    const panel = screen.getByRole('button', { name: 'Register' }).closest('form') as HTMLElement;
    await userEvent.type(within(panel).getByRole('textbox', { name: 'principal_id' }), 'identity-bff');
    await userEvent.click(within(panel).getByRole('button', { name: 'Register' }));
    expect(await screen.findByText('A principal_id is a UUID.')).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);
  });

  it('shows a refused registration attributed to the API', async () => {
    api(() =>
      json(
        {
          status: 409,
          detail: 'enrolment caller: the workload is already registered',
          correlation_id: 'c0ffee00-0000-4000-8000-000000000009',
        },
        409,
      ),
    );
    renderApp('/workloads');
    await userEvent.click(await screen.findByRole('button', { name: 'Register a caller' }));
    const panel = screen.getByRole('button', { name: 'Register' }).closest('form') as HTMLElement;
    await userEvent.type(within(panel).getByRole('textbox', { name: 'principal_id' }), bffWorkload);
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Purpose' }), 'The enrolment BFF');
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Reason' }), 'Wiring the enrolment page');
    await userEvent.click(within(panel).getByRole('button', { name: 'Register' }));
    expect(
      await screen.findByText('The API said: enrolment caller: the workload is already registered'),
    ).toBeInTheDocument();
  });

  it('retires an active caller with a reason', async () => {
    const { sent } = api(() => json({ ...active, retired_at: '2026-10-21T10:00:00Z' }));
    renderApp('/workloads');
    await userEvent.click(await screen.findByRole('button', { name: 'Show the enrolment callers' }));
    await userEvent.click(await screen.findByRole('button', { name: `Retire ${bffWorkload}` }));
    const panel = screen.getByRole('button', { name: 'Retire' }).closest('form') as HTMLElement;
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'The laptop was lost, INC-7.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Retire' }));

    expect(await screen.findByText('The enrolment caller is retired.')).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe(`/api/v1/enrolment-callers/${bffWorkload}:retire`);
    expect(request?.headers['x-administrative-reason']).toBe('The laptop was lost, INC-7.');
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
