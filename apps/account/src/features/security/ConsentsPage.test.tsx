import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

import { accessEndsBy, type MyConsent } from './security-api';

// TDD-identity-experience-002 1.11.0 §Consents, on identity-control's slice 3b (TDD-identity-control-005
// 2.13.0): the consents a person gave, and withdrawing one, which is not revocation.

const signedIn = {
  authenticated: true,
  principalId: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  displayName: 'Ada',
  acr: '1',
  authTime: null,
  idleExpiresAt: '2026-10-20T10:30:00Z',
  absoluteExpiresAt: '2026-10-20T18:00:00Z',
  csrfToken: 'csrf-from-the-session',
};

const partner: MyConsent = {
  security_ref: 'k1.partner',
  client: 'partner-travel-portal',
  scopes: ['openid', 'scnehaux-profile'],
  granted_at: '2026-10-10T08:00:00Z',
  updated_at: null,
  access_token_lifetime_seconds: 300,
};

const unregistered: MyConsent = {
  security_ref: 'k1.legacy',
  client: 'legacy-partner',
  scopes: ['openid'],
  granted_at: '2026-10-11T08:00:00Z',
  access_token_lifetime_seconds: null,
};

function api(
  consents: readonly MyConsent[],
  command?: (sent: Sent) => Response | undefined,
): { readonly sent: Sent[] } {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === '/api/v1/me/consents') {
      return json({ consents });
    }
    return undefined;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ConsentsPage', () => {
  it('lists each consent with what the client may use and how long access it holds lasts', async () => {
    api([partner, unregistered]);
    const { container } = renderApp('/consents');
    const table = await screen.findByRole('table', { name: 'Applications you allowed' });
    expect(within(table).getByText('partner-travel-portal')).toBeInTheDocument();
    expect(within(table).getByText('openid, scnehaux-profile')).toBeInTheDocument();
    expect(within(table).getByText('Up to 5 minutes')).toBeInTheDocument();
    expect(within(table).getByText('Until its token expires')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Consents' })).toHaveAttribute('aria-current', 'page');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says why the list is empty for most people', async () => {
    api([]);
    renderApp('/consents');
    expect(await screen.findByText(/Only an application a partner runs asks you/)).toBeInTheDocument();
  });

  it('withdraws with an Idempotency-Key and no reason, and says access already held ends later, not now', async () => {
    const { sent } = api([partner], () =>
      json({
        operation_id: '0192f0e0-9999-7000-8000-000000000002',
        operation_type: 'consent.withdraw',
        state: 'applied',
      }),
    );
    renderApp('/consents');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Withdraw your consent to partner-travel-portal' }),
    );
    const status = await screen.findByText(/Consent to partner-travel-portal withdrawn\./);
    expect(status).toHaveTextContent('It gets no new access, and access it already holds ends by');
    expect(status).not.toHaveTextContent(/access (is )?removed/i);

    const [request] = sent.filter((entry) => entry.method === 'POST');
    expect(request?.url.pathname).toBe('/api/v1/me/consents/k1.partner:withdraw');
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(request?.headers['x-administrative-reason']).toBeUndefined();
    expect(request?.headers['x-csrf-token']).toBe('csrf-from-the-session');
  });

  it('renders a refused withdrawal as the API’s refusal', async () => {
    api([partner], () =>
      json({
        operation_id: '0192f0e0-9999-7000-8000-000000000003',
        operation_type: 'consent.withdraw',
        state: 'refused',
        result_code: 'not_found',
      }),
    );
    renderApp('/consents');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Withdraw your consent to partner-travel-portal' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Refused (not_found).');
  });
});

describe('accessEndsBy', () => {
  it('is the withdrawal plus the registered lifetime, or unknown without one', () => {
    const at = Date.parse('2026-10-20T09:00:00Z');
    expect(accessEndsBy(partner, at)).toBe(Date.parse('2026-10-20T09:05:00Z'));
    expect(accessEndsBy(unregistered, at)).toBeNull();
  });
});
