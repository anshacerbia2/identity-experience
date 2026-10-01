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
  it('reads only the dangling mappings and the standing grants: no Principal population is listed', async () => {
    const { requests } = api();
    const { container } = renderApp('/principals');
    const table = await screen.findByRole('table', { name: 'Principals whose Keycloak user is gone' });
    expect(within(table).getByText(lost)).toBeInTheDocument();
    const reads = requests.filter((url) => url.pathname.startsWith('/api/'));
    expect(reads.map((url) => url.pathname).sort()).toEqual([
      '/api/v1/application-developers',
      '/api/v1/principals:dangling',
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
    const { sent } = api(() => json({ recovered: 1, dangling: 2 }));
    renderApp('/principals');
    await userEvent.click(await screen.findByRole('button', { name: 'Run the Principal sweep now' }));
    expect(await screen.findByText('Sweep finished: 1 recovered, 2 dangling.')).toBeInTheDocument();
    expect(posts(sent)[0]?.url.pathname).toBe('/api/v1/principals:reconcile');
  });

  it('says so when no mapping is dangling', async () => {
    api(undefined, []);
    renderApp('/principals');
    expect(await screen.findByText('Every active Principal has its Keycloak user.')).toBeInTheDocument();
  });
});
