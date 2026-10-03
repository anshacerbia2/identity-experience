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

function api(command?: (sent: Sent) => Response | undefined) {
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
        return json({
          authenticators: [{ security_ref: 'k1.pw', type: 'password', created: '2026-10-01T08:00:00Z' }],
        });
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

  it('renders the API’s refusal of the last way to sign in rather than deciding it', async () => {
    api(() =>
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
    expect(await screen.findByText('Refused: this is your last way to sign in.')).toBeInTheDocument();
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
