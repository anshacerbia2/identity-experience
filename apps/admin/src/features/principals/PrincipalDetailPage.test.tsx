import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// TDD-identity-experience-003 §Principal Search and Security State.

const operator = '01a0da74-44e7-7000-b600-b464c5cb8cec';
const subject = '0192f0e0-3333-7000-8000-000000000007';
const csrfToken = 'csrf-from-the-session';
const signedIn = {
  authenticated: true,
  principalId: operator,
  displayName: 'Ada Admin',
  acr: '1',
  authTime: null,
  idleExpiresAt: '2026-10-03T10:30:00Z',
  absoluteExpiresAt: '2026-10-03T18:00:00Z',
  csrfToken,
};

const principal = (overrides: Record<string, unknown> = {}) => ({
  principal_id: subject,
  username: 'alice',
  email: 'alice@example.com',
  subject_type: 'human',
  state: 'active',
  realm: 'scnehaux',
  created_at: '2026-10-01T08:00:00Z',
  activated_at: '2026-10-01T08:00:00Z',
  quarantined_at: null,
  version: 2,
  security_version: 4,
  ...overrides,
});

const operation = (state: string, extra: Record<string, unknown> = {}) => ({
  operation_id: '0192f0e0-9999-7000-8000-000000000001',
  principal_id: subject,
  operation_type: 'suspend',
  state,
  attempts: 1,
  created_at: '2026-10-03T09:00:00Z',
  ...extra,
});

function api(options: {
  readonly detail?: Record<string, unknown>;
  readonly command?: (sent: Sent) => Response | undefined;
  readonly authenticators?: readonly Record<string, unknown>[];
  readonly search?: readonly Record<string, unknown>[];
}) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return options.command?.(sent);
    }
    switch (url.pathname) {
      case '/api/v1/principals:search':
        return json({ principals: options.search ?? [] });
      case `/api/v1/principals/${subject}`:
        return json(options.detail ?? principal());
      case `/api/v1/principals/${subject}/sessions`:
        return json({
          sessions: [
            {
              started: '2026-10-03T07:00:00Z',
              last_access: '2026-10-03T08:00:00Z',
              clients: ['identity-experience'],
            },
          ],
        });
      case `/api/v1/principals/${subject}/authenticators`:
        return json({
          authenticators: options.authenticators ?? [
            { security_ref: 'k1.password', type: 'password', created: '2026-10-01T08:00:00Z' },
            { security_ref: 'k1.otp', type: 'otp', label: 'phone', created: '2026-10-02T08:00:00Z' },
          ],
        });
      case '/api/v1/security-operations/0192f0e0-9999-7000-8000-000000000001':
        return json(operation('applied'));
      default:
        return undefined;
    }
  });
}

const reads = (requests: readonly URL[]) =>
  requests.map((url) => url.pathname).filter((path) => path.startsWith('/api/'));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Principal search', () => {
  it('lists nothing until a query is sent, refuses a short one, and links each result', async () => {
    const { requests } = api({
      search: [
        {
          principal_id: subject,
          username: 'alice',
          email: 'alice@example.com',
          subject_type: 'human',
          state: 'active',
        },
      ],
    });
    renderApp('/principals');
    const field = await screen.findByRole('textbox', { name: 'Username or email' });
    expect(reads(requests)).not.toContain('/api/v1/principals:search');

    await userEvent.type(field, 'a*');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(
      await screen.findByText('Type at least three characters that are not wildcards.'),
    ).toBeInTheDocument();
    expect(reads(requests)).not.toContain('/api/v1/principals:search');

    await userEvent.clear(field);
    await userEvent.type(field, 'ali');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    const table = await screen.findByRole('table', { name: 'Principals found' });
    expect(within(table).getByRole('link', { name: 'alice' })).toHaveAttribute(
      'href',
      `/principals/${subject}`,
    );
    const search = requests.find((url) => url.pathname === '/api/v1/principals:search');
    expect(search?.searchParams.get('q')).toBe('ali');
  });
});

describe('PrincipalDetailPage', () => {
  it('reads the Principal on arrival and each section only when it is opened', async () => {
    const { requests } = api({});
    const { container } = renderApp(`/principals/${subject}`);
    expect(await screen.findByRole('heading', { name: 'alice' })).toBeInTheDocument();
    expect(reads(requests)).toEqual([`/api/v1/principals/${subject}`]);

    const [sessions] = screen.getAllByRole('button', { name: 'Show — this read is recorded' });
    await userEvent.click(sessions as HTMLElement);
    expect(await screen.findByText('identity-experience')).toBeInTheDocument();
    expect(reads(requests)).toEqual([
      `/api/v1/principals/${subject}`,
      `/api/v1/principals/${subject}/sessions`,
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('suspends with a reason, the security_version and an Idempotency-Key, and says what happened', async () => {
    const { sent } = api({ command: () => json(operation('applied')) });
    renderApp(`/principals/${subject}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /reason/i }),
      'incident 42: credential stuffing',
    );
    const form = screen.getByRole('button', { name: 'Cancel' }).closest('form') as HTMLElement;
    await userEvent.click(within(form).getByRole('button', { name: 'Suspend' }));

    expect(
      await screen.findByText('Suspended. Sign-in is stopped and every session has ended.'),
    ).toBeInTheDocument();
    const [command] = sent.filter((request) => request.method === 'POST');
    expect(command?.url.pathname).toBe(`/api/v1/principals/${subject}:suspend`);
    expect(command?.body).toEqual({ expected_version: 4 });
    expect(command?.headers['x-administrative-reason']).toBe('incident 42: credential stuffing');
    expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(command?.headers['x-csrf-token']).toBe(csrfToken);
  });

  it('follows a 202 until the operation is final', async () => {
    const { requests } = api({ command: () => json(operation('pending'), 202) });
    renderApp(`/principals/${subject}`);
    await userEvent.click(await screen.findByRole('button', { name: 'End every session' }));
    await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'incident 42');
    const form = screen.getByRole('button', { name: 'Cancel' }).closest('form') as HTMLElement;
    await userEvent.click(within(form).getByRole('button', { name: 'End every session' }));
    expect(await screen.findByText('Every session has ended.', {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(reads(requests)).toContain('/api/v1/security-operations/0192f0e0-9999-7000-8000-000000000001');
  });

  it('offers a sign-in with the challenge’s max_age when the API asks for a recent one', async () => {
    api({
      command: () =>
        new Response(
          JSON.stringify({ type: 'https://problems.scnehaux.com/authentication-required', status: 401 }),
          {
            status: 401,
            headers: {
              'content-type': 'application/problem+json',
              'www-authenticate': 'Bearer error="insufficient_user_authentication", max_age=300',
            },
          },
        ),
    });
    renderApp(`/principals/${subject}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'incident 42');
    const form = screen.getByRole('button', { name: 'Cancel' }).closest('form') as HTMLElement;
    await userEvent.click(within(form).getByRole('button', { name: 'Suspend' }));
    const link = await screen.findByRole('link', { name: 'Sign in again to continue' });
    expect(link.getAttribute('href')).toMatch(/^\/auth\/login\?max_age=300&return_to=/);
    // The session is kept: the shell still shows the operator.
    expect(screen.getAllByText('Ada Admin').length).toBeGreaterThan(0);
  });

  it('does not offer the last way to sign in, and shows what remains for another', async () => {
    api({});
    renderApp(`/principals/${subject}`);
    await screen.findByRole('heading', { name: 'alice' });
    const buttons = screen.getAllByRole('button', { name: 'Show — this read is recorded' });
    await userEvent.click(buttons[1] as HTMLElement);
    const table = await screen.findByRole('table', { name: 'Authenticators' });
    expect(within(table).getByText('The last way to sign in: suspend instead.')).toBeInTheDocument();
    const revoke = within(table).getAllByRole('button', { name: 'Revoke' });
    expect(revoke).toHaveLength(1);
    await userEvent.click(revoke[0] as HTMLElement);
    expect(screen.getByText('One other way to sign in remains.')).toBeInTheDocument();
  });

  it('offers nothing on a workload or a quarantined Principal', async () => {
    for (const [detail, sentence] of [
      [principal({ subject_type: 'workload' }), 'A workload is contained on its own page.'],
      [
        principal({ state: 'quarantined', quarantined_at: '2026-10-02T00:00:00Z' }),
        'Nothing is offered for a Principal that is quarantined.',
      ],
    ] as const) {
      vi.unstubAllGlobals();
      api({ detail });
      const { unmount } = renderApp(`/principals/${subject}`);
      await screen.findByRole('heading', { name: detail.username });
      expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
      expect(screen.getByText(sentence)).toBeInTheDocument();
      unmount();
    }
  });

  it('says so when its own Principal is opened', async () => {
    stubFetch((url) => {
      if (url.pathname === '/auth/session') {
        return json(signedIn);
      }
      if (url.pathname === `/api/v1/principals/${operator}`) {
        return json(principal({ principal_id: operator, username: 'ada' }));
      }
      return undefined;
    });
    renderApp(`/principals/${operator}`);
    expect(
      await screen.findByText(
        'This is your own Principal. Containing yourself is refused; your own sessions are ended through self-service.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
  });
});
