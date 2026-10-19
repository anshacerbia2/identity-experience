import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// TDD-identity-experience-003 1.28.0 §A First Credential, Shown Once (ADR-IAM-010): the value is shown
// once, held in one component's state, and in no cache, store, URL or log.

const operator = '01a0da74-44e7-7000-b600-b464c5cb8cec';
const subject = '0192f0e0-3333-7000-8000-000000000007';
const csrfToken = 'csrf-from-the-session';
const value = 'K7QH2M9XRT4WZP6VDN3BC8FA';
const signedIn = {
  authenticated: true,
  principalId: operator,
  displayName: 'Ada Admin',
  acr: 'aal2',
  authTime: null,
  idleExpiresAt: '2026-10-19T10:30:00Z',
  absoluteExpiresAt: '2026-10-19T18:00:00Z',
  csrfToken,
};

const principal = (overrides: Record<string, unknown> = {}) => ({
  principal_id: subject,
  username: 'billy',
  email: 'billy@example.com',
  subject_type: 'human',
  state: 'active',
  realm: 'scnehaux',
  created_at: '2026-10-19T08:00:00Z',
  activated_at: '2026-10-19T08:00:00Z',
  quarantined_at: null,
  version: 1,
  security_version: 1,
  ...overrides,
});

const issuance = (withValue: boolean) => ({
  temporary_password: {
    issuance_id: '0192f0e0-7777-7000-8000-000000000001',
    principal_id: subject,
    issued_at: '2026-10-19T09:00:00Z',
    lapses_at: '2026-10-20T09:00:00Z',
    ...(withValue ? { value } : {}),
  },
});

const problem = (status: number, type: string, detail: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ type, status, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  });

function api(command: (sent: Sent) => Response | undefined, detail = principal()) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command(sent);
    }
    if (url.pathname === `/api/v1/principals/${subject}`) {
      return json(detail);
    }
    if (url.pathname === '/api/v1/principals:dangling') {
      return json({ dangling: [] });
    }
    if (url.pathname === '/api/v1/application-developers') {
      return json({ developers: [] });
    }
    if (url.pathname === '/api/v1/principals:unmapped') {
      return json({ unmapped: [] });
    }
    if (url.pathname === '/api/v1/security-operations:unresolved') {
      return json({ operations: [] });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]) => sent.filter((request) => request.method === 'POST');

async function issue(reason = 'new joiner, verified on a call'): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Issue a new temporary password' }));
  await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), reason);
  await userEvent.click(screen.getByRole('button', { name: 'Issue' }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('a temporary password on a Principal’s page', () => {
  it('sends a reason and an Idempotency-Key, and shows the value once with its lapse and how to hand it over', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { sent } = api(() => json(issuance(true), 201));
    const { container } = renderApp(`/principals/${subject}`);
    await issue();

    expect(await screen.findByText(value)).toBeInTheDocument();
    expect(screen.getByText('Temporary password, shown once')).toBeInTheDocument();
    expect(screen.getByText('Lapses')).toBeInTheDocument();
    expect(
      screen.getByText(/on a channel other than the one that carries their username/),
    ).toBeInTheDocument();

    const [command] = posts(sent);
    expect(command?.url.pathname).toBe(`/api/v1/principals/${subject}:issue-temporary-password`);
    expect(command?.body).toEqual({});
    expect(command?.headers['x-administrative-reason']).toBe('new joiner, verified on a call');
    expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(command?.headers['x-csrf-token']).toBe(csrfToken);

    // Nowhere but the page: no browser storage, no URL.
    for (const [, stored] of setItem.mock.calls) {
      expect(stored).not.toContain(value);
    }
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let index = 0; index < storage.length; index++) {
        expect(storage.getItem(storage.key(index) ?? '') ?? '').not.toContain(value);
      }
    }
    expect(window.location.href).not.toContain(value);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('copies the value and announces the result', async () => {
    api(() => json(issuance(true), 201));
    renderApp(`/principals/${subject}`);
    // userEvent installs its own clipboard on setup, so the stub follows it.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(await screen.findByRole('button', { name: 'Issue a new temporary password' }));
    await user.type(screen.getByRole('textbox', { name: /reason/i }), 'new joiner');
    await user.click(screen.getByRole('button', { name: 'Issue' }));
    await user.click(await screen.findByRole('button', { name: 'Copy the password' }));
    expect(writeText).toHaveBeenCalledWith(value);
    const status = await screen.findByText('Copied to the clipboard.');
    expect(status.closest('[role="status"]')).not.toBeNull();
  });

  it('says so when the copy fails', async () => {
    api(() => json(issuance(true), 201));
    renderApp(`/principals/${subject}`);
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    await user.click(await screen.findByRole('button', { name: 'Issue a new temporary password' }));
    await user.type(screen.getByRole('textbox', { name: /reason/i }), 'new joiner');
    await user.click(screen.getByRole('button', { name: 'Issue' }));
    await user.click(await screen.findByRole('button', { name: 'Copy the password' }));
    expect(
      await screen.findByText('It could not be copied. Select it and copy it yourself.'),
    ).toBeInTheDocument();
  });

  it('is gone once handed over, and cannot be shown again', async () => {
    api(() => json(issuance(true), 201));
    renderApp(`/principals/${subject}`);
    await issue();
    await userEvent.click(await screen.findByRole('button', { name: 'I have handed it over' }));
    expect(screen.queryByText(value)).not.toBeInTheDocument();
    expect(
      screen.getByText('The password is no longer shown. It cannot be shown again.'),
    ).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(value);
  });

  it('is gone after leaving the page and coming back', async () => {
    api(() => json(issuance(true), 201));
    renderApp(`/principals/${subject}`);
    await issue();
    expect(await screen.findByText(value)).toBeInTheDocument();
    const hero = screen.getByRole('heading', { level: 1, name: 'billy' }).closest('header') as HTMLElement;
    await userEvent.click(within(hero).getByRole('link', { name: 'Principals' }));
    expect(await screen.findByRole('button', { name: 'Create a Principal' })).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(value);
  });

  it('says a retry answered without the value cannot show it, and offers a new one', async () => {
    api(() => json(issuance(false), 200));
    renderApp(`/principals/${subject}`);
    await issue();
    expect(
      await screen.findByText(
        'This request was already answered, so its password cannot be shown again. Issue a new one: it replaces the first.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issue a new temporary password' })).toBeInTheDocument();
  });

  it('says the person set their own password when the API refuses with credential-established', async () => {
    api(() =>
      problem(
        409,
        'https://problems.scnehaux.com/state-transition-refused',
        'credential-established: the Principal has set a password of its own',
      ),
    );
    renderApp(`/principals/${subject}`);
    await issue();
    expect(
      await screen.findByText(/Refused: this person has set a password of their own/),
    ).toBeInTheDocument();
  });

  it('shows any other refusal with the API’s sentence', async () => {
    api(() =>
      problem(409, 'https://problems.scnehaux.com/state-transition-refused', 'The Principal is not active'),
    );
    renderApp(`/principals/${subject}`);
    await issue();
    expect(await screen.findByText(/The Principal is not active/)).toBeInTheDocument();
  });

  it('offers a sign-in again when the API asks for a recent aal2', async () => {
    api(() =>
      problem(401, 'https://problems.scnehaux.com/authentication-required', 'sign in again', {
        'www-authenticate': 'Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=300',
      }),
    );
    renderApp(`/principals/${subject}`);
    await issue();
    const link = await screen.findByRole('link', { name: 'Sign in again to continue' });
    expect(link.getAttribute('href')).toMatch(/max_age=300/);
  });

  it('is offered for an active person only, never for the operator, a workload or a suspended person', async () => {
    for (const detail of [
      principal({ principal_id: subject, state: 'suspended' }),
      principal({ subject_type: 'workload' }),
    ]) {
      api(() => undefined, detail);
      const view = renderApp(`/principals/${subject}`);
      await screen.findByRole('heading', { level: 1, name: 'billy' });
      expect(
        screen.queryByRole('button', { name: 'Issue a new temporary password' }),
      ).not.toBeInTheDocument();
      view.unmount();
      vi.unstubAllGlobals();
    }
  });
});

describe('a temporary password after creating a person', () => {
  it('is offered on the panel that shows the new principal_id', async () => {
    const { sent } = api((request) =>
      request.url.pathname === '/api/v1/principals'
        ? json({ principal_id: subject, subject_type: 'human', realm: 'scnehaux' }, 201)
        : json(issuance(true), 201),
    );
    const { container } = renderApp('/principals');
    await userEvent.click(await screen.findByRole('button', { name: 'Create a Principal' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Username' }), 'billy');
    await userEvent.click(screen.getByRole('button', { name: 'Create Principal' }));
    expect(await screen.findByText(subject)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Issue a temporary password' }));
    await userEvent.type(screen.getByRole('textbox', { name: /reason/i }), 'new joiner, verified on a call');
    await userEvent.click(screen.getByRole('button', { name: 'Issue' }));
    expect(await screen.findByText(value)).toBeInTheDocument();
    expect(posts(sent).map((request) => request.url.pathname)).toEqual([
      '/api/v1/principals',
      `/api/v1/principals/${subject}:issue-temporary-password`,
    ]);
    expect(await axe(container)).toHaveNoViolations();

    // Creating another person discards the panel and its value.
    await userEvent.click(screen.getByRole('button', { name: 'Create another' }));
    expect(document.body.innerHTML).not.toContain(value);
  });
});
