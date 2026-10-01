import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { Registration, Standing } from '@identity-experience/app-core/domain/registration';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// Registering a client (TDD-identity-experience-004 §Registering a Client, ADR-IAM-003 §5.3): offered
// only to an application developer outside production, and only within what one may register.

const me = '11111111-1111-4111-8111-111111111111';
const signedIn = {
  authenticated: true,
  principalId: me,
  displayName: 'Dana Developer',
  acr: 'aal2',
  authTime: '2026-10-01T08:00:00Z',
  idleExpiresAt: '2026-10-01T08:30:00Z',
  absoluteExpiresAt: '2026-10-01T16:00:00Z',
  csrfToken: 'csrf',
};

const developer: Standing = { provider: false, application_developer: true, environment: 'non-production' };

const ordersApi: Registration = {
  registration_id: '22222222-2222-4222-8222-222222222222',
  realm: 'scnehaux',
  client_key: 'orders-api',
  profile: 'resource',
  audience_class: 'internal',
  application_authority: 'manual',
  application_ref: 'orders',
  registered_by: me,
  signing_algorithm: 'PS256',
  lifetime_class: 'L1',
  audience: [],
  redirect_uris: [],
  state: 'active',
  version: 2,
  created_at: '2026-09-01T10:00:00Z',
};

const { lifetime_class: _resourceOnly, ...clientFields } = ordersApi;

const created: Registration = {
  ...clientFields,
  registration_id: '33333333-3333-4333-8333-333333333333',
  client_key: 'orders-web',
  profile: 'confidential',
  audience: ['orders-api'],
  redirect_uris: ['https://orders.example.com/callback'],
  version: 2,
};

const publicJwk = { kty: 'RSA', n: 'sXch-Mo_B7E', e: 'AQAB' };

const waiting = {
  request_id: 'q-1',
  client_key: 'orders-web',
  request: {
    client_key: 'orders-web',
    profile: 'public',
    audience_class: 'internal',
    application_ref: 'orders',
  },
  owners: [me, '44444444-4444-4444-8444-444444444444'],
  proposed_by: me,
  proposal_reason: 'Orders goes live in October',
  proposed_at: '2026-10-01T09:00:00Z',
  state: 'proposed',
  decided_by: null,
  decided_at: null,
  registration_id: null,
};

function api(standing: Standing | null, command?: (sent: Sent) => Response) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === '/api/v1/registrations:standing') {
      return standing === null ? undefined : json(standing);
    }
    if (url.pathname === '/api/v1/registrations:mine') {
      return json({ registrations: [ordersApi] });
    }
    if (url.pathname === '/api/v1/registration-requests:mine') {
      return json({ requests: [waiting] });
    }
    if (url.pathname === `/api/v1/registrations/${created.registration_id}`) {
      return json(created);
    }
    if (url.pathname.startsWith(`/api/v1/registrations/${created.registration_id}/`)) {
      return json({ keys: [], owners: [], changes: [] });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registering a client', () => {
  it('is offered to an application developer outside production, and nowhere else', async () => {
    api(developer);
    renderApp('/developer/');
    expect(await screen.findByRole('button', { name: 'Register a client' })).toBeInTheDocument();
  });

  it('in production, offers a request instead, and lists the person’s requests', async () => {
    api({ ...developer, environment: 'production' });
    renderApp('/developer/');
    expect(await screen.findByRole('button', { name: 'Request a production client' })).toBeInTheDocument();
    const requests = await screen.findByRole('table', { name: 'Production registrations you requested' });
    expect(within(requests).getByText('Waiting for approval')).toBeInTheDocument();
    expect(within(requests).getByRole('button', { name: 'Withdraw orders-web' })).toBeInTheDocument();
  });

  it('in production, requests the client naming at least two owners, with a reason', async () => {
    const colleague = '44444444-4444-4444-8444-444444444444';
    const { sent } = api({ ...developer, environment: 'production' }, () => json(waiting, 201));
    renderApp('/developer/registrations/new');

    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: /Client key/ }), 'orders-web');
    await user.type(screen.getByRole('textbox', { name: /Application reference/ }), 'orders');
    await user.selectOptions(screen.getByRole('combobox', { name: /Profile/ }), 'public');
    await user.type(
      screen.getByRole('textbox', { name: /Redirect URIs/ }),
      'https://orders.example.com/callback',
    );
    const owners = screen.getByRole('textbox', { name: /Owners, one principal_id per line/ });
    expect(owners).toHaveValue(`${me}\n`);
    await user.type(screen.getByLabelText(/Reason/), 'Orders goes live in October');
    await user.click(screen.getByRole('button', { name: 'Request' }));
    expect(await screen.findByText('Name at least 2 different owners.')).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);

    await user.type(owners, colleague);
    await user.click(screen.getByRole('button', { name: 'Request' }));
    expect(await screen.findByText('orders-web is requested')).toBeInTheDocument();
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe('/api/v1/registration-requests');
    expect(command?.headers['x-administrative-reason']).toBe('Orders goes live in October');
    expect(command?.body).toMatchObject({
      client_key: 'orders-web',
      profile: 'public',
      owners: [me, colleague],
    });
  });

  it('is not offered without the standing, and its page says how to get it', async () => {
    api({ ...developer, application_developer: false });
    renderApp('/developer/registrations/new');
    expect(
      await screen.findByText(/takes application developer standing, which a provider grants/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register' })).not.toBeInTheDocument();
  });

  it('offers only what an application developer may register', async () => {
    api(developer);
    const { container } = renderApp('/developer/registrations/new');

    const profile = await screen.findByRole('combobox', { name: /Profile/ });
    expect(
      within(profile)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Public', 'Confidential', 'Resource']);
    const audienceClass = screen.getByRole('combobox', { name: /Audience class/ });
    expect(
      within(audienceClass)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Internal', 'External']);
    // The audience lists only the person's own resources.
    const audience = await screen.findByRole('listbox', { name: /Audience/ });
    expect(
      within(audience)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['orders-api']);

    // A resource's lifetime class reads as its interval, never as a label.
    await userEvent.selectOptions(profile, 'resource');
    const lifetime = screen.getByRole('combobox', { name: /Token lifetime/ });
    const labels = within(lifetime)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(labels.some((label) => label.includes('Token valid 9 minutes'))).toBe(true);
    expect(labels.some((label) => /\bL[0-3]\b/.test(label))).toBe(false);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('registers a confidential client once, under an Idempotency-Key, and opens it', async () => {
    const { sent } = api(developer, () => json(created, 201));
    renderApp('/developer/registrations/new');

    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: /Client key/ }), 'orders-web');
    await user.type(screen.getByRole('textbox', { name: /Application reference/ }), 'orders');
    await user.type(
      screen.getByRole('textbox', { name: /Redirect URIs/ }),
      'https://orders.example.com/callback',
    );
    await user.selectOptions(screen.getByRole('listbox', { name: /Audience/ }), 'orders-api');
    await user.click(screen.getByRole('textbox', { name: /First public key/ }));
    await user.paste(JSON.stringify(publicJwk));
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'orders-web' })).toBeInTheDocument();
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe('/api/v1/registrations');
    expect(command?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(command?.body).toEqual({
      client_key: 'orders-web',
      profile: 'confidential',
      audience_class: 'internal',
      application_ref: 'orders',
      redirect_uris: ['https://orders.example.com/callback'],
      audience: ['orders-api'],
      public_key: publicJwk,
    });
  });

  it('refuses a pasted private key before anything is sent, and shows the API’s refusal otherwise', async () => {
    const { sent } = api(
      developer,
      () =>
        new Response(
          JSON.stringify({
            detail: 'registration: invalid request: client_key must be 1 to 128 lowercase letters',
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/problem+json' },
          },
        ),
    );
    renderApp('/developer/registrations/new');

    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: /Client key/ }), 'Orders Web');
    await user.type(screen.getByRole('textbox', { name: /Application reference/ }), 'orders');
    await user.type(
      screen.getByRole('textbox', { name: /Redirect URIs/ }),
      'https://orders.example.com/callback',
    );
    await user.click(screen.getByRole('textbox', { name: /First public key/ }));
    await user.paste(JSON.stringify({ ...publicJwk, d: 'private' }));
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByText(/This is a private key, and it was not sent/)).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);

    await user.clear(screen.getByRole('textbox', { name: /First public key/ }));
    await user.click(screen.getByRole('textbox', { name: /First public key/ }));
    await user.paste(JSON.stringify(publicJwk));
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'client_key must be 1 to 128 lowercase letters',
    );
  });
});
