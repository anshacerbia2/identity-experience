import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { RegistrationRequestRecord } from '@identity-experience/app-core/domain/registration';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// Production registration requests on the Approvals page (TDD-identity-experience-003 §Change
// Approval, ADR-IAM-003 §5.3): the document and owners as requested, decided by a provider who did
// not request it.

const me = '01a0da74-44e7-7000-b600-b464c5cb8cec';
const developer = '01a0da74-44e7-7000-b600-b464c5cb8ced';
const colleague = '01a0da74-44e7-7000-b600-b464c5cb8cee';
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

const request = (overrides: Partial<RegistrationRequestRecord>): RegistrationRequestRecord => ({
  request_id: 'q-1',
  client_key: 'orders-web',
  request: {
    client_key: 'orders-web',
    profile: 'confidential',
    audience_class: 'internal',
    application_ref: 'orders',
    redirect_uris: ['https://orders.example.com/callback'],
    audience: ['orders-api'],
  },
  owners: [developer, colleague],
  proposed_by: developer,
  proposal_reason: 'Orders goes live in October',
  proposed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  state: 'proposed',
  decided_by: null,
  decided_at: null,
  registration_id: null,
  ...overrides,
});

function api(requests: readonly RegistrationRequestRecord[], command?: (sent: Sent) => Response) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === '/api/v1/registration-requests') {
      return json({ requests });
    }
    if (url.pathname === '/api/v1/registrations:changes') {
      return json({ changes: [] });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((sent) => sent.method === 'POST');

async function section(): Promise<HTMLElement> {
  return (await screen.findByRole('heading', { name: 'Production registration requests' })).closest(
    'section',
  ) as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('production registration requests', () => {
  it('shows each request as it was submitted, with its owners and age', async () => {
    api([request({}), request({ request_id: 'q-2', client_key: 'billing-web', proposed_by: me })]);
    const { container } = renderApp('/changes');

    const requests = await section();
    expect(await within(requests).findByText('orders-web')).toBeInTheDocument();
    expect(within(requests).getAllByText('https://orders.example.com/callback')).toHaveLength(2);
    expect(within(requests).getAllByText(colleague)).toHaveLength(2);
    expect(within(requests).getAllByText(/waiting 2 days/)).toHaveLength(2);
    // Only another provider's request is decided here.
    expect(within(requests).getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
    expect(
      within(requests).getByText('You requested this, so another provider decides it.'),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('approves a request with a reason and links to the registration it created', async () => {
    const { sent } = api([request({})], () =>
      json(request({ state: 'approved', decided_by: me, registration_id: 'r-orders' })),
    );
    renderApp('/changes');

    const requests = await section();
    const user = userEvent.setup();
    await user.click(await within(requests).findByRole('button', { name: 'Approve' }));
    await user.type(within(requests).getByLabelText(/Reason/), 'Checked the callback host is ours');
    const submit = within(requests)
      .getAllByRole('button', { name: 'Approve' })
      .find((button) => button.getAttribute('type') === 'submit');
    await user.click(submit as HTMLElement);

    expect(
      await within(requests).findByRole('link', { name: /orders-web is approved and registered/ }),
    ).toHaveAttribute('href', '/registrations/r-orders');
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe('/api/v1/registration-requests/q-1:approve');
    expect(command?.headers['x-administrative-reason']).toBe('Checked the callback host is ours');
  });

  it('rejects a request with a reason', async () => {
    const { sent } = api([request({})], () => json(request({ state: 'rejected', decided_by: me })));
    renderApp('/changes');

    const requests = await section();
    const user = userEvent.setup();
    await user.click(await within(requests).findByRole('button', { name: 'Reject' }));
    await user.type(within(requests).getByLabelText(/Reason/), 'Use the existing orders client');
    const submit = within(requests)
      .getAllByRole('button', { name: 'Reject' })
      .find((button) => button.getAttribute('type') === 'submit');
    await user.click(submit as HTMLElement);

    expect(await within(requests).findByText('The request for orders-web is rejected.')).toBeInTheDocument();
    expect(posts(sent)[0]?.url.pathname).toBe('/api/v1/registration-requests/q-1:reject');
  });

  it('says so when no request waits', async () => {
    api([]);
    renderApp('/changes');
    expect(
      await screen.findByText('No production registration is waiting for approval.'),
    ).toBeInTheDocument();
  });
});
