import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, renderApp, stubFetch } from '@/test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

const session = {
  authenticated: true,
  principalId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Dana Developer',
  acr: 'aal2',
  authTime: '2026-10-01T08:00:00Z',
  idleExpiresAt: '2026-10-01T08:30:00Z',
  absoluteExpiresAt: '2026-10-01T16:00:00Z',
  csrfToken: 'csrf',
};

const registration = {
  registration_id: '22222222-2222-4222-8222-222222222222',
  realm: 'scnehaux',
  client_key: 'billing-web',
  profile: 'confidential',
  audience_class: 'internal',
  application_authority: 'catalog',
  application_ref: 'billing',
  registered_by: '33333333-3333-4333-8333-333333333333',
  signing_algorithm: 'PS256',
  audience: ['billing-api'],
  redirect_uris: ['https://billing.example.com/callback'],
  state: 'active',
  version: 3,
  created_at: '2026-09-01T10:00:00Z',
};

describe('My registrations', () => {
  it('lists the registrations the signed-in person owns, from the owner route', async () => {
    const { requests } = stubFetch((url) => {
      if (url.pathname === '/auth/session') return json(session);
      if (url.pathname === '/api/v1/registrations:mine') return json({ registrations: [registration] });
      return undefined;
    });
    renderApp('/developer/');

    const table = await screen.findByRole('table', { name: 'Registrations you own' });
    const row = within(table).getByRole('row', { name: /billing-web/ });
    expect(row).toHaveTextContent('Confidential');
    expect(row).toHaveTextContent('Active');
    // The provider-only list is never asked for: this console is the owner's.
    expect(requests.map((url) => url.pathname)).not.toContain('/api/v1/registrations');
  });

  it('says how ownership is granted when the person owns nothing, including an empty answer of null', async () => {
    stubFetch((url) => {
      if (url.pathname === '/auth/session') return json(session);
      if (url.pathname === '/api/v1/registrations:mine') return json({ registrations: null });
      return undefined;
    });
    renderApp('/developer/');

    expect(await screen.findByText('You own no registration yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('states a failed read with its reference and offers to try again', async () => {
    stubFetch((url) => {
      if (url.pathname === '/auth/session') return json(session);
      if (url.pathname === '/api/v1/registrations:mine') {
        return new Response(JSON.stringify({ correlation_id: 'c-123' }), {
          status: 503,
          headers: { 'content-type': 'application/problem+json' },
        });
      }
      return undefined;
    });
    renderApp('/developer/');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The Identity Control API did not answer');
    expect(alert).toHaveTextContent('c-123');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in, returning to the console, and reads nothing', async () => {
    const { requests } = stubFetch((url) =>
      url.pathname === '/auth/session' ? json({ authenticated: false }) : undefined,
    );
    renderApp('/developer/');

    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Sign in' })) {
      // Without the base path the sign-in would land in the Admin Portal.
      expect(link).toHaveAttribute('href', `/auth/login?return_to=${encodeURIComponent('/developer/')}`);
    }
    expect(requests.map((url) => url.pathname)).not.toContain('/api/v1/registrations:mine');
  });

  it('says a refused sign-in failed, where the BFF lands it', async () => {
    stubFetch(() => json({ authenticated: false }));
    renderApp('/developer/?sign-in=failed');
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in did not complete');
  });

  it('is in Indonesian when the locale is', async () => {
    stubFetch((url) => {
      if (url.pathname === '/auth/session') return json(session);
      if (url.pathname === '/api/v1/registrations:mine') return json({ registrations: [registration] });
      return undefined;
    });
    renderApp('/developer/', 'id');

    expect(await screen.findByRole('table', { name: 'Registrasi yang kamu miliki' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Registrasi saya');
  });
});
