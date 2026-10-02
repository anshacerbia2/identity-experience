import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { RegistrationChange } from '@identity-experience/app-core/domain/registration';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// The approval queue (TDD-identity-experience-003 §Change Approval, ADR-IAM-003 §5.2): a provider
// approves or rejects a change it did not propose, with a reason, and decides nothing it proposed.

const me = '01a0da74-44e7-7000-b600-b464c5cb8cec';
const colleague = '01a0da74-44e7-7000-b600-b464c5cb8ced';
const signedIn = {
  authenticated: true,
  principalId: me,
  displayName: 'Ada Admin',
  acr: '1',
  authTime: null,
  idleExpiresAt: '2026-10-01T10:30:00Z',
  absoluteExpiresAt: '2026-10-01T18:00:00Z',
  csrfToken: 'csrf',
};

const change = (overrides: Partial<RegistrationChange>): RegistrationChange => ({
  change_id: 'c-1',
  registration_id: 'r-billing',
  client_key: 'billing-web',
  base_version: 3,
  previous_redirect_uris: ['https://billing.example.com/callback'],
  redirect_uris: ['https://pay.example.com/callback'],
  approval_required: true,
  proposed_by: colleague,
  proposal_reason: 'Payments move to their own host',
  proposed_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  state: 'proposed',
  decided_by: null,
  decided_at: null,
  ...overrides,
});

function api(queue: readonly RegistrationChange[], command?: (sent: Sent) => Response) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === '/api/v1/registrations:changes') {
      return json({ changes: queue });
    }
    if (url.pathname === '/api/v1/registration-requests') {
      return json({ requests: [] });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the approval queue', () => {
  it('shows each waiting change as its before and after, linked to its registration, with its age', async () => {
    api([
      change({}),
      change({ change_id: 'c-2', client_key: 'orders-web', registration_id: 'r-orders', proposed_by: me }),
    ]);
    const { container } = renderApp('/changes');

    const link = await screen.findByRole('link', { name: 'billing-web' });
    expect(link).toHaveAttribute('href', '/registrations/r-billing');
    expect(screen.getAllByText('Added')).toHaveLength(2);
    expect(screen.getAllByText('Removed')).toHaveLength(2);
    expect(screen.getAllByText('Waiting 4 days')).toHaveLength(2);
    // One's own proposal offers no decision; another's offers both.
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
    expect(screen.getByText('You proposed this, so another provider decides it.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('approves another provider’s change with a reason', async () => {
    const { sent } = api([change({})], () => json(change({ state: 'applied', decided_by: me })));
    renderApp('/changes');

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await user.type(screen.getByLabelText(/Reason/), 'Checked the new host belongs to us');
    const submit = screen
      .getAllByRole('button', { name: 'Approve' })
      .find((button) => button.getAttribute('type') === 'submit');
    await user.click(submit as HTMLElement);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'The change to billing-web is approved and applied.',
    );
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe('/api/v1/registrations/r-billing/changes/c-1:approve');
    expect(command?.headers['x-administrative-reason']).toBe('Checked the new host belongs to us');
  });

  it('says nothing was applied when the change was superseded', async () => {
    api([change({})], () => json(change({ state: 'superseded', decided_by: me })));
    renderApp('/changes');

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await user.type(screen.getByLabelText(/Reason/), 'Checked the new host belongs to us');
    const submit = screen
      .getAllByRole('button', { name: 'Approve' })
      .find((button) => button.getAttribute('type') === 'submit');
    await user.click(submit as HTMLElement);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'billing-web changed since this was proposed',
    );
  });

  it('says so when nothing waits, and is in Indonesian when the locale is', async () => {
    api([]);
    renderApp('/changes', 'id');
    expect(await screen.findByText('Tidak ada perubahan yang menunggu persetujuan.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Control plane' })).getByRole('link', {
        name: 'Persetujuan',
      }),
    ).toBeInTheDocument();
  });
});
