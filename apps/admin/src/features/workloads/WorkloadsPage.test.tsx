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
const workloadId = '0192f0e0-4444-7000-8000-000000000001';
const successor = '0192f0e0-5555-7000-8000-000000000001';
const publicKey = { kty: 'RSA', n: 'sXch-Mo_B7E', e: 'AQAB' };

const workload = {
  principal_id: workloadId,
  registration_id: '0192f0e0-6666-7000-8000-000000000001',
  client_key: 'nightly-job',
  display_name: 'Nightly payroll export',
  purpose: 'Exports approved payroll to the bank each night',
  workload_type: 'job',
  owner_principal_id: signedIn.principalId,
  team_reference: 'payroll-platform',
  owner_recorded_at: '2026-09-30T08:00:00Z',
  state: 'active',
  orphaned_at: null,
  last_seen_at: null,
  created_by: signedIn.principalId,
  created_at: '2026-09-30T08:00:00Z',
  activated_at: '2026-09-30T08:00:01Z',
};

function api(command?: (sent: Sent) => Response | undefined) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === `/api/v1/workloads/${workloadId}`) {
      return json(workload);
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

async function fillCreate(key: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Create a workload' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Nightly payroll export');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'job');
  await userEvent.type(screen.getByRole('textbox', { name: 'Purpose' }), 'Exports approved payroll');
  await userEvent.type(screen.getByRole('textbox', { name: 'Accountable owner' }), signedIn.principalId);
  await userEvent.type(screen.getByRole('textbox', { name: 'Team' }), 'payroll-platform');
  await userEvent.type(screen.getByRole('textbox', { name: 'client_key' }), 'nightly-job');
  await userEvent.type(screen.getByRole('textbox', { name: 'Application' }), 'payroll');
  await userEvent.type(screen.getByRole('textbox', { name: 'Audience' }), 'payroll-api');
  const field = screen.getByRole('textbox', { name: 'Public key (JWK)' });
  await userEvent.click(field);
  await userEvent.paste(key);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WorkloadsPage', () => {
  it('reads nothing until a workload is looked up: no workload population is listed', async () => {
    const { requests } = api();
    const { container } = renderApp('/workloads');
    expect(await screen.findByRole('button', { name: 'Create a workload' })).toBeInTheDocument();
    expect(requests.filter((url) => url.pathname.startsWith('/api/'))).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('creates a workload with its public key, an Idempotency-Key and the CSRF token', async () => {
    const { sent } = api(() => json(workload, 201));
    renderApp('/workloads');
    await fillCreate(JSON.stringify(publicKey));
    await userEvent.click(screen.getByRole('button', { name: 'Create workload' }));

    expect(await screen.findByText(workloadId)).toBeInTheDocument();
    expect(screen.getByText(/It authenticates as nightly-job/)).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/workloads');
    expect(request?.body).toEqual({
      display_name: 'Nightly payroll export',
      purpose: 'Exports approved payroll',
      workload_type: 'job',
      owner_principal_id: signedIn.principalId,
      team_reference: 'payroll-platform',
      client_key: 'nightly-job',
      application_ref: 'payroll',
      audience: ['payroll-api'],
      public_key: publicKey,
    });
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses a private key without sending it', async () => {
    const { sent } = api(() => json(workload, 201));
    renderApp('/workloads');
    await fillCreate(JSON.stringify({ ...publicKey, d: 'the-private-exponent' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create workload' }));
    expect(await screen.findByText(/This is a private key, and it was not sent/)).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);
  });

  it('shows a refused creation attributed to the API', async () => {
    api(() =>
      json(
        {
          status: 400,
          detail: 'workload: the owner must be an active human Principal',
          correlation_id: 'c0ffee00-0000-4000-8000-000000000003',
        },
        400,
      ),
    );
    renderApp('/workloads');
    await fillCreate(JSON.stringify(publicKey));
    await userEvent.click(screen.getByRole('button', { name: 'Create workload' }));
    expect(
      await screen.findByText('The API said: workload: the owner must be an active human Principal'),
    ).toBeInTheDocument();
  });

  it('finds a workload by its principal_id and reassigns it with a reason', async () => {
    const { sent } = api(() => json({ ...workload, owner_principal_id: successor }));
    renderApp('/workloads');
    await userEvent.type(await screen.findByRole('textbox', { name: 'principal_id' }), workloadId);
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByRole('heading', { name: 'Nightly payroll export' })).toBeInTheDocument();
    expect(screen.getByText('payroll-platform')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reassign' }));
    const panel = (await screen.findByRole('heading', { name: 'Reassign this workload' })).closest(
      'section',
    ) as HTMLElement;
    const owner = within(panel).getByRole('textbox', { name: 'New owner' });
    await userEvent.type(owner, signedIn.principalId);
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'The owner moved to the bank team.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Reassign' }));
    expect(await within(panel).findByText('This person already owns the workload.')).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);

    await userEvent.clear(owner);
    await userEvent.type(owner, successor);
    await userEvent.click(within(panel).getByRole('button', { name: 'Reassign' }));
    expect(await screen.findByText('Reassigned.')).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe(`/api/v1/workloads/${workloadId}:reassign`);
    expect(request?.body).toEqual({ owner_principal_id: successor });
    expect(request?.headers['x-administrative-reason']).toBe('The owner moved to the bank team.');
    expect(await screen.findByText(successor)).toBeInTheDocument();
  });

  it('says why a lookup found nothing', async () => {
    api();
    renderApp('/workloads');
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'principal_id' }),
      '0192f0e0-9999-7000-8000-000000000009',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
