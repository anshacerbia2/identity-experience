import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

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
const lost = '0192f0e0-1111-7000-8000-000000000042';
const duplicateOf = '0192f0e0-3333-7000-8000-000000000007';
const parkedId = '0192f0e0-9999-7000-8000-000000000001';
const unmapped = [
  {
    finding_id: 'f-1',
    finding_class: 'unmapped',
    username: 'mallory',
    user_disabled: true,
    detected_at: '2026-10-01T08:00:00Z',
  },
  {
    finding_id: 'f-2',
    finding_class: 'orphan',
    claimed_principal_id: '0192f0e0-4444-7000-8000-00000000dead',
    username: 'ghost',
    user_disabled: false,
    detected_at: '2026-10-02T08:00:00Z',
  },
  {
    finding_id: 'f-3',
    finding_class: 'duplicate',
    principal_id: duplicateOf,
    username: 'grace-2',
    user_disabled: true,
    detected_at: '2026-10-03T08:00:00Z',
  },
];
const parked = [
  {
    operation_id: parkedId,
    principal_id: lost,
    operation_type: 'sessions.terminate-all',
    attempts: 8,
    last_error_class: 'kernel_unavailable',
    created_at: '2026-10-04T08:00:00Z',
  },
];

function api(
  command?: (sent: Sent) => Response | undefined,
  dangling = [{ principal_id: lost, detected_at: '2026-09-29T08:00:00Z' }],
) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === '/api/v1/principals:dangling') {
      return json({ dangling });
    }
    if (url.pathname === '/api/v1/application-developers') {
      return json({ developers: [] });
    }
    if (url.pathname === '/api/v1/principals:unmapped') {
      return json({ unmapped });
    }
    if (url.pathname === '/api/v1/security-operations:unresolved') {
      return json({ operations: parked });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

async function openCreate(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Create a Principal' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PrincipalsPage', () => {
  it('reads only the finding lists, the parked operations and the standing grants: no Principal population is listed', async () => {
    const { requests } = api();
    const { container } = renderApp('/principals');
    const table = await screen.findByRole('table', { name: 'Principals whose Keycloak user is gone' });
    expect(within(table).getByText(lost)).toBeInTheDocument();
    const reads = requests.filter((url) => url.pathname.startsWith('/api/'));
    await screen.findByRole('table', { name: 'Parked operations, oldest first' });
    await screen.findByRole('table', { name: 'Open findings about kernel users, oldest first' });
    expect([...new Set(reads.map((url) => url.pathname))].sort()).toEqual([
      '/api/v1/application-developers',
      '/api/v1/principals:dangling',
      '/api/v1/principals:unmapped',
      '/api/v1/security-operations:unresolved',
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('creates a person with an Idempotency-Key and the CSRF token, and shows the principal_id', async () => {
    const { sent } = api(() =>
      json(
        { principal_id: '0192f0e0-2222-7000-8000-000000000001', subject_type: 'human', realm: 'scnehaux' },
        201,
      ),
    );
    renderApp('/principals');
    await openCreate();
    await userEvent.type(screen.getByRole('textbox', { name: 'Username' }), ' ada.lovelace ');
    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Create Principal' }));

    expect(await screen.findByText('0192f0e0-2222-7000-8000-000000000001')).toBeInTheDocument();
    expect(
      screen.getByText('Keycloak asks this person to set a password at first sign-in.'),
    ).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/principals');
    expect(request?.body).toEqual({
      username: 'ada.lovelace',
      email: 'ada@example.com',
      subject_type: 'human',
    });
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('creates only a person: a workload is created on the Workloads page', async () => {
    api();
    renderApp('/principals');
    await openCreate();
    expect(screen.queryByRole('combobox', { name: 'Kind' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Accountable owner' })).not.toBeInTheDocument();
  });

  it('retries the same request under the same key, and a changed one under a new key', async () => {
    const { sent } = api(() =>
      json({ status: 503, detail: 'The identity kernel did not confirm the operation' }, 503),
    );
    renderApp('/principals');
    await openCreate();
    const username = screen.getByRole('textbox', { name: 'Username' });
    await userEvent.type(username, 'grace');
    const submit = screen.getByRole('button', { name: 'Create Principal' });
    await userEvent.click(submit);
    expect(
      await screen.findByText('The Identity Control API did not answer. Try again in a moment.'),
    ).toBeInTheDocument();
    await userEvent.click(submit);
    await userEvent.type(username, '.hopper');
    await userEvent.click(submit);
    await vi.waitFor(() => {
      expect(posts(sent)).toHaveLength(3);
    });
    const keys = posts(sent).map((request) => request.headers['idempotency-key']);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('relinks a dangling mapping with a reason, and says where it ended', async () => {
    const { sent } = api(() => json({ principal_id: lost, state: 'pending' }));
    renderApp('/principals');
    await userEvent.click(await screen.findByRole('button', { name: 'Relink' }));
    const panel = (await screen.findByRole('heading', { name: 'Relink this Principal' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'User deleted by mistake, ticket OPS-42.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Relink' }));

    expect(await screen.findByText(/The Principal is pending/)).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe(`/api/v1/principals/${lost}:relink`);
    expect(request?.headers['x-administrative-reason']).toBe('User deleted by mistake, ticket OPS-42.');
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
  });

  it('shows a refused relink attributed to the API', async () => {
    api(() =>
      json(
        {
          status: 409,
          detail: "The Principal's Keycloak user still exists; there is nothing to relink",
          correlation_id: 'c0ffee00-0000-4000-8000-000000000002',
        },
        409,
      ),
    );
    renderApp('/principals');
    await userEvent.click(await screen.findByRole('button', { name: 'Relink' }));
    const panel = (await screen.findByRole('heading', { name: 'Relink this Principal' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'User deleted by mistake, ticket OPS-42.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Relink' }));
    expect(
      await within(panel).findByText(
        "The API said: The Principal's Keycloak user still exists; there is nothing to relink",
      ),
    ).toBeInTheDocument();
  });

  it('runs the Principal sweep and reports what it did', async () => {
    const { sent } = api(() => json({ recovered: 1, dangling: 2, unmapped: 3, orphan: 0, duplicate: 1 }));
    renderApp('/principals');
    await userEvent.click(await screen.findByRole('button', { name: 'Run the Principal sweep now' }));
    expect(
      await screen.findByText(
        'Sweep finished: 1 recovered, 2 dangling, 3 unmapped, 0 orphaned, 1 duplicate.',
      ),
    ).toBeInTheDocument();
    expect(posts(sent)[0]?.url.pathname).toBe('/api/v1/principals:reconcile');
    expect(posts(sent)[0]?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('says so when no mapping is dangling', async () => {
    api(undefined, []);
    renderApp('/principals');
    expect(await screen.findByText('Every active Principal has its Keycloak user.')).toBeInTheDocument();
  });

  it('lists the kernel users no Principal accounts for, by class, and offers no action', async () => {
    api();
    renderApp('/principals');
    const table = await screen.findByRole('table', {
      name: 'Open findings about kernel users, oldest first',
    });
    expect(within(table).getByText('No identifier')).toBeInTheDocument();
    expect(within(table).getByText('Identifier no Principal holds')).toBeInTheDocument();
    expect(within(table).getByText('0192f0e0-4444-7000-8000-00000000dead')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: duplicateOf })).toHaveAttribute(
      'href',
      `/principals/${duplicateOf}`,
    );
    expect(within(table).getAllByText('Disabled by the sweep')).toHaveLength(2);
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
  });

  it('re-drives a parked operation with a reason and an Idempotency-Key, and says where it came to', async () => {
    const { sent } = api(() =>
      json({ ...parked[0], state: 'applied', attempts: 9, applied_at: '2026-10-08T08:00:00Z' }),
    );
    renderApp('/principals');
    const table = await screen.findByRole('table', { name: 'Parked operations, oldest first' });
    expect(within(table).getByText('End every session')).toBeInTheDocument();
    expect(within(table).getByText('kernel_unavailable')).toBeInTheDocument();
    await userEvent.click(within(table).getByRole('button', { name: `Re-drive ${parkedId}` }));
    const panel = (await screen.findByRole('heading', { name: 'Re-drive the operation' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'Kernel back after the outage, OPS-77.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Re-drive' }));

    expect(await screen.findByText('The operation is applied.')).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe(`/api/v1/security-operations/${parkedId}:redrive`);
    expect(request?.headers['x-administrative-reason']).toBe('Kernel back after the outage, OPS-77.');
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('shows a refused re-drive with the API sentence', async () => {
    api(() =>
      json({ status: 409, detail: 'The operation is not unresolved; it was already re-driven' }, 409),
    );
    renderApp('/principals');
    const table = await screen.findByRole('table', { name: 'Parked operations, oldest first' });
    await userEvent.click(within(table).getByRole('button', { name: `Re-drive ${parkedId}` }));
    const panel = (await screen.findByRole('heading', { name: 'Re-drive the operation' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'Kernel back after the outage, OPS-77.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Re-drive' }));
    expect(
      await within(panel).findByText(
        'The API said: The operation is not unresolved; it was already re-driven',
      ),
    ).toBeInTheDocument();
  });
});
