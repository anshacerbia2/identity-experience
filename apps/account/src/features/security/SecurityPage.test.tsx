import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// TDD-identity-experience-002 §As Built: Sessions and Authenticators.

const csrfToken = 'csrf-from-the-session';
const signedIn = {
  authenticated: true,
  principalId: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  displayName: 'Ada',
  acr: '1',
  authTime: null,
  idleExpiresAt: '2026-10-03T10:30:00Z',
  absoluteExpiresAt: '2026-10-03T18:00:00Z',
  csrfToken,
};
const operation = (state: string, extra: Record<string, unknown> = {}) => ({
  operation_id: '0192f0e0-9999-7000-8000-000000000001',
  operation_type: 'session.terminate',
  state,
  ...extra,
});

function api(
  command?: (sent: Sent) => Response | undefined,
  authenticators: readonly Record<string, unknown>[] = [
    { security_ref: 'k1.pw', type: 'password', created: '2026-10-01T08:00:00Z' },
  ],
  addresses: readonly Record<string, unknown>[] = [
    {
      address_id: '01a0da74-0000-7000-8000-000000000001',
      channel: 'email',
      address: 'ada@example.com',
      origin: 'creation',
      state: 'active',
      added_at: '2026-10-01T08:00:00Z',
    },
  ],
) {
  let signedOut = false;
  const stub = stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedOut ? { authenticated: false } : signedIn);
    }
    if (url.pathname === '/auth/logout') {
      signedOut = true;
      return new Response(null, { status: 204 });
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    switch (url.pathname) {
      case '/api/v1/me/sessions':
        return json({
          sessions: [
            {
              security_ref: 'k1.here',
              started: '2026-10-03T07:00:00Z',
              last_access: '2026-10-03T09:00:00Z',
              clients: ['identity-experience-bff'],
              current: true,
            },
            {
              security_ref: 'k1.there',
              started: '2026-10-02T07:00:00Z',
              last_access: '2026-10-02T09:00:00Z',
              clients: ['identity-experience-bff'],
              current: false,
            },
          ],
        });
      case '/api/v1/me/authenticators':
        return json({ authenticators });
      case '/api/v1/me/notification-addresses':
        return json({ notification_addresses: addresses });
      default:
        return undefined;
    }
  });
  return stub;
}

const posts = (sent: readonly Sent[]) => sent.filter((request) => request.method === 'POST');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SecurityPage', () => {
  it('lists the sessions with this browser marked, and the authenticators', async () => {
    api();
    const { container } = renderApp('/account/');
    const sessions = await screen.findByRole('table', { name: 'Where you are signed in' });
    expect(within(sessions).getByText('This browser')).toBeInTheDocument();
    // This browser's session is ended by signing out everywhere, not from its row.
    expect(within(sessions).getAllByRole('button', { name: 'End' })).toHaveLength(1);
    expect(await screen.findByRole('table', { name: 'How you sign in' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ends another session with only an Idempotency-Key, and says how long its access lasts', async () => {
    const { sent } = api(() => json(operation('applied')));
    renderApp('/account/');
    const sessions = await screen.findByRole('table', { name: 'Where you are signed in' });
    await userEvent.click(within(sessions).getByRole('button', { name: 'End' }));
    expect(
      await screen.findByText('Ended. That device signs in again to continue, within four minutes at most.'),
    ).toBeInTheDocument();
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe('/api/v1/me/sessions/k1.there:terminate');
    expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(command?.headers['x-administrative-reason']).toBeUndefined();
    expect(command?.headers['x-csrf-token']).toBe(csrfToken);
  });

  it('signs out everywhere only after a confirmation, and then signs this browser out too', async () => {
    const { sent } = api(() => json(operation('applied', { operation_type: 'sessions.terminate-all' })));
    renderApp('/account/');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    expect(posts(sent)).toHaveLength(0);
    const confirm = screen
      .getByRole('heading', { name: 'Sign out everywhere, this browser included' })
      .closest('section') as HTMLElement;
    await userEvent.click(within(confirm).getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => {
      expect(posts(sent).map((request) => request.url.pathname)).toEqual([
        '/api/v1/me/sessions:terminate-all',
        '/auth/logout',
      ]);
    });
  });

  // Replacement is enrollment, then removal (TDD-identity-experience-002 §The Last Authenticator
  // Guard): the refusal says so, and the ways to add one are on the same page.
  it('renders the API’s refusal of the last way to sign in rather than deciding it, and the way to replace it', async () => {
    const { sent } = api(() =>
      json(
        operation('refused', { operation_type: 'authenticator.remove', result_code: 'last_authenticator' }),
      ),
    );
    renderApp('/account/');
    const table = await screen.findByRole('table', { name: 'How you sign in' });
    await userEvent.click(within(table).getByRole('button', { name: 'Remove' }));
    const form = screen
      .getByRole('heading', { name: 'Remove this password' })
      .closest('section') as HTMLElement;
    await userEvent.click(within(form).getByRole('button', { name: 'Remove' }));
    expect(
      await screen.findByText(
        'Refused: this is your last way to sign in. To replace it, add another one first, then remove this one.',
      ),
    ).toBeInTheDocument();
    for (const name of ['Add an authenticator app', 'Add a security key']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    const [command] = posts(sent);
    expect(command?.url.pathname).toMatch(/^\/api\/v1\/me\/authenticators\/.+:remove$/);
    expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(command?.headers['x-csrf-token']).toBe(csrfToken);
  });

  it('offers a fresh sign-in when removing needs a recent one', async () => {
    api(
      () =>
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
    );
    renderApp('/account/');
    const table = await screen.findByRole('table', { name: 'How you sign in' });
    await userEvent.click(within(table).getByRole('button', { name: 'Remove' }));
    const form = screen
      .getByRole('heading', { name: 'Remove this password' })
      .closest('section') as HTMLElement;
    await userEvent.click(within(form).getByRole('button', { name: 'Remove' }));
    const link = await screen.findByRole('link', { name: 'Sign in again to continue' });
    expect(link.getAttribute('href')).toMatch(/^\/auth\/login\?max_age=300&return_to=/);
  });
});

describe('enrolling an authenticator app', () => {
  it('asks the API, then goes to the kernel page that enrolls it', async () => {
    const { browser } = await import('./security-api');
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => undefined);
    const { sent } = api((request) =>
      request.url.pathname === '/api/v1/me/authenticators:enroll'
        ? json({ action: 'CONFIGURE_TOTP' })
        : undefined,
    );
    renderApp('/account/');
    await userEvent.click(await screen.findByRole('button', { name: 'Add an authenticator app' }));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/auth/login?kc_action=CONFIGURE_TOTP&return_to=%2Faccount%2F');
    });
    const [request] = posts(sent);
    expect(request?.body).toEqual({ type: 'totp' });
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('adds a security key through webauthn-register', async () => {
    const { browser } = await import('./security-api');
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => undefined);
    const { sent } = api((request) =>
      request.url.pathname === '/api/v1/me/authenticators:enroll'
        ? json({ action: 'webauthn-register' })
        : undefined,
    );
    renderApp('/account/');
    await userEvent.click(await screen.findByRole('button', { name: 'Add a security key' }));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/auth/login?kc_action=webauthn-register&return_to=%2Faccount%2F');
    });
    const [request] = posts(sent);
    expect(request?.body).toEqual({ type: 'webauthn' });
  });

  it('gets a new set of recovery codes, and says when a code of the set was used', async () => {
    const { browser } = await import('./security-api');
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => undefined);
    const { sent } = api(
      (request) =>
        request.url.pathname === '/api/v1/me/authenticators:enroll'
          ? json({ action: 'CONFIGURE_RECOVERY_AUTHN_CODES' })
          : undefined,
      [
        { security_ref: 'k1.pw', type: 'password', created: '2026-10-01T08:00:00Z' },
        {
          security_ref: 'k1.codes',
          type: 'recovery-authn-codes',
          created: '2026-10-04T00:00:00Z',
          remaining_codes: 11,
          total_codes: 12,
        },
      ],
    );
    renderApp('/account/');
    expect(await screen.findByText('11 of 12 codes left')).toBeTruthy();
    expect(screen.getByText(/A recovery code was used to sign in/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Get new recovery codes' }));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(
        '/auth/login?kc_action=CONFIGURE_RECOVERY_AUTHN_CODES&return_to=%2Faccount%2F',
      );
    });
    const [request] = posts(sent);
    expect(request?.body).toEqual({ type: 'recovery-codes' });
  });

  it('offers the step-up its level needs, and goes nowhere', async () => {
    const { browser } = await import('./security-api');
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => undefined);
    api(
      () =>
        new Response(JSON.stringify({ status: 401 }), {
          status: 401,
          headers: {
            'content-type': 'application/problem+json',
            'www-authenticate':
              'Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=300',
          },
        }),
    );
    renderApp('/account/');
    await userEvent.click(await screen.findByRole('button', { name: 'Add an authenticator app' }));
    const link = await screen.findByRole('link', { name: 'Sign in again to continue' });
    expect(link.getAttribute('href')).toMatch(/max_age=300&acr_values=aal2&return_to=/);
    expect(assign).not.toHaveBeenCalled();
  });
});

// TDD-identity-experience-002 1.6.0: where a person is told (ADR-IAM-007 §5.2).
describe('notification addresses', () => {
  const pending = {
    address_id: '01a0da74-0000-7000-8000-000000000002',
    channel: 'email',
    address: 'ada.backup@example.com',
    origin: 'added',
    state: 'pending',
    added_at: '2026-10-03T08:00:00Z',
  };

  it('lists the addresses and asks for a second while there is one', async () => {
    api();
    renderApp('/account/');
    const table = await screen.findByRole('table', { name: 'Where you are told' });
    expect(within(table).getByText('ada@example.com')).toBeInTheDocument();
    expect(within(table).getByText('In use')).toBeInTheDocument();
    expect(
      screen.getByText(/Add a second, so a change to your account still reaches you/),
    ).toBeInTheDocument();
  });

  it('adds an address with an Idempotency-Key and says a code was sent', async () => {
    const stub = api(() => json({ notification_address: pending }, 201));
    renderApp('/account/');
    await screen.findByRole('table', { name: 'Where you are told' });
    await userEvent.type(screen.getByLabelText('Another email address'), 'ada.backup@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText(/A code was sent to that address/);
    const [add] = posts(stub.sent);
    expect(add?.url.pathname).toBe('/api/v1/me/notification-addresses');
    expect(add?.body).toEqual({ address: 'ada.backup@example.com' });
    expect(add?.headers['idempotency-key']).toMatch(/.+/);
    expect(add?.headers['x-csrf-token']).toBe(csrfToken);
  });

  it('proves a pending address with the code typed next to it', async () => {
    const stub = api(() => new Response(null, { status: 204 }), undefined, [
      {
        address_id: '01a0da74-0000-7000-8000-000000000001',
        channel: 'email',
        address: 'ada@example.com',
        origin: 'creation',
        state: 'active',
        added_at: '2026-10-01T08:00:00Z',
      },
      pending,
    ]);
    renderApp('/account/');
    const table = await screen.findByRole('table', { name: 'Where you are told' });
    expect(within(table).getByText('Waiting for its code')).toBeInTheDocument();
    await userEvent.type(within(table).getByLabelText('Code sent to it'), '12345678');
    await userEvent.click(within(table).getByRole('button', { name: 'Confirm' }));
    await screen.findByText(/Confirmed. That address is now told about every change/);
    const [verify] = posts(stub.sent);
    expect(verify?.url.pathname).toBe(`/api/v1/me/notification-addresses/${pending.address_id}:verify`);
    expect(verify?.body).toEqual({ code: '12345678' });
    expect(verify?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('renders the refusal to remove the last address, and the step-up a removal needs', async () => {
    api(
      () =>
        new Response(
          JSON.stringify({ type: 'https://problems.scnehaux.com/authentication-required', status: 401 }),
          {
            status: 401,
            headers: {
              'content-type': 'application/problem+json',
              'www-authenticate':
                'Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=300',
            },
          },
        ),
    );
    renderApp('/account/');
    const table = await screen.findByRole('table', { name: 'Where you are told' });
    await userEvent.click(within(table).getByRole('button', { name: 'Remove' }));
    const link = await screen.findByRole('link', { name: 'Sign in again to continue' });
    expect(link.getAttribute('href')).toMatch(/^\/auth\/login\?max_age=300&acr_values=aal2&return_to=/);
  });

  it('has no axe violations with a pending address', async () => {
    api(undefined, undefined, [pending]);
    const { container } = renderApp('/account/');
    await screen.findByRole('table', { name: 'Where you are told' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
