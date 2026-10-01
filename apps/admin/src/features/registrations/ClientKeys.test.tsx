import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { ClientKey, Registration } from '@identity-experience/app-core/domain/registration';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// The client key panel (TDD-identity-experience-003 §Registration Drift Oversight, behaving as
// TDD-identity-experience-004's ClientKeyPanel): the keys, rotation and revocation, and no private
// key ever sent.

const csrfToken = 'csrf-from-the-session';
const signedIn = {
  authenticated: true,
  principalId: 'prn_01TEST',
  displayName: 'Ada Admin',
  acr: '1',
  authTime: null,
  idleExpiresAt: '2026-09-29T10:30:00Z',
  absoluteExpiresAt: '2026-09-29T18:00:00Z',
  csrfToken,
};

const bff: Registration = {
  registration_id: 'r-bff',
  realm: 'scnehaux',
  client_key: 'identity-experience-bff',
  profile: 'confidential',
  audience_class: 'privileged',
  application_authority: 'manual',
  application_ref: 'identity-experience',
  registered_by: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  signing_algorithm: 'PS256',
  audience: [],
  redirect_uris: ['http://127.0.0.1:8090/auth/callback'],
  access_token_lifespan: 240,
  state: 'active',
  version: 2,
  created_at: '2026-09-28T09:00:00Z',
};

const key = (
  id: string,
  kid: string,
  state: ClientKey['state'],
  extra: Partial<ClientKey> = {},
): ClientKey => ({
  key_id: id,
  registration_id: 'r-bff',
  kid,
  thumbprint: `thumb-${kid}`,
  state,
  registered_by: signedIn.principalId,
  registered_at: '2026-09-28T09:00:00Z',
  expires_at: '2026-12-27T09:00:00Z',
  retiring_at: null,
  revoked_at: null,
  revoked_by: null,
  ...extra,
});

const publicJwk = JSON.stringify({ kty: 'RSA', n: 'sXch-Mo_B7E', e: 'AQAB' });

function api(registration: Registration, keys: readonly ClientKey[], command?: (sent: Sent) => Response) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === '/api/v1/registrations/r-bff') {
      return json(registration);
    }
    if (url.pathname === '/api/v1/registrations/r-bff/keys') {
      return json({ keys });
    }
    if (url.pathname === '/api/v1/registrations/r-bff/findings') {
      return json({ findings: [] });
    }
    if (url.pathname === '/api/v1/registrations/r-bff/drift-exceptions') {
      return json({ exceptions: [] });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

async function keysSection(): Promise<HTMLElement> {
  return (await screen.findByRole('heading', { name: 'Client keys' })).closest('section') as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClientKeys', () => {
  it('lists the keys, offers no rotation while one is retiring, and revokes with a reason', async () => {
    const retiringAt = new Date(Date.now() + 5 * 3_600_000 + 60_000).toISOString();
    const keys = [
      key('k-hp', 'hp', 'active'),
      key('k-laptop', 'laptop', 'retiring', { retiring_at: retiringAt }),
    ];
    const { sent } = api(bff, keys, () => json({ keys }));
    const { container } = renderApp('/registrations/r-bff');

    const section = await keysSection();
    const rows = within(await within(section).findByRole('table', { name: 'Registered keys' })).getAllByRole(
      'row',
    );
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getByText('Active')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('thumb-hp')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Retiring')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('removed in 5 hours')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Rotate to a new key' })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(within(section).getByRole('button', { name: 'Revoke laptop' }));
    const form = (await screen.findByRole('heading', { name: 'Revoke key laptop' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(form).getByText(/refused from the next request/)).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Revoke' }));
    expect(posts(sent)).toHaveLength(0);
    await userEvent.type(within(form).getByRole('textbox', { name: 'Reason' }), 'The old laptop was wiped.');
    await userEvent.click(within(form).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('The key is revoked.')).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/registrations/r-bff/keys/k-laptop:revoke');
    expect(request?.headers['x-administrative-reason']).toBe('The old laptop was wiped.');
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
  });

  it('refuses a pasted private key before sending, and rotates to a public one', async () => {
    const before = [key('k-hp', 'hp', 'active')];
    const after = [
      key('k-new', 'new', 'active'),
      key('k-hp', 'hp', 'retiring', { retiring_at: '2026-10-08T09:00:00Z' }),
    ];
    const { sent } = api(bff, before, () => json({ keys: after }, 201));
    renderApp('/registrations/r-bff');

    await userEvent.click(
      await within(await keysSection()).findByRole('button', { name: 'Rotate to a new key' }),
    );
    const form = (await screen.findByRole('heading', { name: "Rotate this client's key" })).closest(
      'section',
    ) as HTMLElement;
    const field = within(form).getByRole('textbox', { name: 'Next public key (JWK)' });
    await userEvent.click(field);
    await userEvent.paste(JSON.stringify({ kty: 'RSA', n: 'sXch-Mo_B7E', e: 'AQAB', d: 'secret' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Rotate' }));
    expect(await within(form).findByText(/private/i)).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);

    await userEvent.clear(field);
    await userEvent.click(field);
    await userEvent.paste(publicJwk);
    await userEvent.click(within(form).getByRole('button', { name: 'Rotate' }));
    expect(
      await screen.findByText('The new key is active; the previous one is retiring.'),
    ).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/registrations/r-bff/keys');
    expect(request?.body).toEqual({ public_key: JSON.parse(publicJwk) });
  });

  it('reports a retry that met the key already active as no change', async () => {
    const keys = [key('k-hp', 'hp', 'active')];
    api(bff, keys, () => json({ keys }));
    renderApp('/registrations/r-bff');
    await userEvent.click(
      await within(await keysSection()).findByRole('button', { name: 'Rotate to a new key' }),
    );
    const form = (await screen.findByRole('heading', { name: "Rotate this client's key" })).closest(
      'section',
    ) as HTMLElement;
    const field = within(form).getByRole('textbox', { name: 'Next public key (JWK)' });
    await userEvent.click(field);
    await userEvent.paste(publicJwk);
    await userEvent.click(within(form).getByRole('button', { name: 'Rotate' }));
    expect(
      await screen.findByText('That key was already the active one; nothing changed.'),
    ).toBeInTheDocument();
  });

  it("warns that revoking the client's last key stops it authenticating", async () => {
    api(bff, [key('k-hp', 'hp', 'active')]);
    renderApp('/registrations/r-bff');
    await userEvent.click(await within(await keysSection()).findByRole('button', { name: 'Revoke hp' }));
    const form = (await screen.findByRole('heading', { name: 'Revoke key hp' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(form).getByText(/stops authenticating until a new key is registered/)).toBeInTheDocument();
  });

  it('shows no key section for a client that holds no key, and reads none', async () => {
    const { requests } = api({ ...bff, profile: 'public' }, []);
    renderApp('/registrations/r-bff');
    await screen.findByRole('heading', { name: 'identity-experience-bff' });
    expect(screen.queryByRole('heading', { name: 'Client keys' })).not.toBeInTheDocument();
    expect(requests.some((url) => url.pathname.endsWith('/keys'))).toBe(false);
  });
});
