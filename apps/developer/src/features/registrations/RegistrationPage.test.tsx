import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { ClientKey, Owner, Registration } from '@identity-experience/app-core/domain/registration';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// The owner's registration page (TDD-identity-experience-004 §Ownership, ADR-IAM-003): the record,
// the keys rotated and revoked, suspend and restore with a reason, and who owns it. Nothing a
// provider alone may do is offered.

const csrfToken = 'csrf-from-the-session';
const me = '11111111-1111-4111-8111-111111111111';
const signedIn = {
  authenticated: true,
  principalId: me,
  displayName: 'Dana Developer',
  acr: 'aal2',
  authTime: '2026-10-01T08:00:00Z',
  idleExpiresAt: '2026-10-01T08:30:00Z',
  absoluteExpiresAt: '2026-10-01T16:00:00Z',
  csrfToken,
};

const id = '22222222-2222-4222-8222-222222222222';

const billing: Registration = {
  registration_id: id,
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
  access_token_lifespan: 540,
  state: 'active',
  version: 3,
  created_at: '2026-09-01T10:00:00Z',
};

const activeKey: ClientKey = {
  key_id: 'k-1',
  registration_id: id,
  kid: 'billing-2026-09',
  thumbprint: 'thumb-billing',
  state: 'active',
  registered_by: me,
  registered_at: '2026-09-01T10:00:00Z',
  expires_at: '2026-11-30T10:00:00Z',
  retiring_at: null,
  revoked_at: null,
  revoked_by: null,
};

const owner = (principal: string, active = true): Owner => ({
  ownership_id: `o-${principal}`,
  registration_id: id,
  principal_id: principal,
  granted_by: '44444444-4444-4444-8444-444444444444',
  grant_reason: 'Billing team lead, accountable for the client',
  granted_at: '2026-09-02T10:00:00Z',
  revoked_at: active ? null : '2026-09-20T10:00:00Z',
  revoked_by: active ? null : '44444444-4444-4444-8444-444444444444',
  active,
});

const colleague = '55555555-5555-4555-8555-555555555555';
const departed = '66666666-6666-4666-8666-666666666666';

function api(registration: Registration, command?: (sent: Sent) => Response) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === `/api/v1/registrations/${id}`) {
      return json(registration);
    }
    if (url.pathname === `/api/v1/registrations/${id}/keys`) {
      return json({ keys: [activeKey] });
    }
    if (url.pathname === `/api/v1/registrations/${id}/owners`) {
      return json({ owners: [owner(me), owner(colleague), owner(departed, false)] });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

async function section(name: string): Promise<HTMLElement> {
  return (await screen.findByRole('heading', { name })).closest('section') as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the owner’s registration page', () => {
  it('shows the record, the keys and the active owners, marking the signed-in one', async () => {
    api(billing);
    const { container } = renderApp(`/developer/registrations/${id}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'billing-web' })).toBeInTheDocument();
    expect(screen.getByText('https://billing.example.com/callback')).toBeInTheDocument();

    const keys = await section('Client keys');
    expect(await within(keys).findByText('thumb-billing')).toBeInTheDocument();
    expect(within(keys).getByRole('button', { name: 'Rotate to a new key' })).toBeInTheDocument();

    const owners = await section('Owners');
    const table = await within(owners).findByRole('table', { name: 'Owners of this registration' });
    const rows = within(table).getAllByRole('row');
    // A header and the two active owners; the revoked ownership is the API's record, not a row.
    expect(rows).toHaveLength(3);
    expect(within(table).getByRole('row', { name: new RegExp(me) })).toHaveTextContent('You');
    expect(within(table).queryByText(departed)).not.toBeInTheDocument();
    // An owner cannot change who owns the registration.
    expect(within(owners).queryByRole('button')).not.toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('offers an owner suspension of an active client, never retirement, and sends the reason', async () => {
    const { sent } = api(billing, () => json({ ...billing, state: 'suspended' }));
    renderApp(`/developer/registrations/${id}`);

    const lifecycle = await section('Lifecycle');
    expect(lifecycle).toHaveTextContent('Retiring a client is a provider’s decision.');
    expect(within(lifecycle).queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(lifecycle).getByRole('button', { name: 'Suspend' }));
    await user.type(within(lifecycle).getByLabelText(/Reason/), 'Credentials leaked in a build log');
    const submit = within(lifecycle)
      .getAllByRole('button', { name: 'Suspend' })
      .find((button) => button.getAttribute('type') === 'submit');
    await user.click(submit as HTMLElement);

    expect(await within(lifecycle).findByRole('status')).toHaveTextContent('The client is suspended.');
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe(`/api/v1/registrations/${id}:suspend`);
    expect(command?.headers['x-administrative-reason']).toBe('Credentials leaked in a build log');
    expect(command?.headers['x-csrf-token']).toBe(csrfToken);
  });

  it('offers an owner restoration of a suspended client, and still no retirement', async () => {
    api({ ...billing, state: 'suspended' });
    renderApp(`/developer/registrations/${id}`);

    const lifecycle = await section('Lifecycle');
    expect(within(lifecycle).getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(within(lifecycle).queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument();
  });

  it('rotates to the next public key the team pasted', async () => {
    const next: ClientKey = { ...activeKey, key_id: 'k-2', kid: 'billing-2026-10', thumbprint: 'thumb-next' };
    const { sent } = api(billing, () =>
      json({ keys: [next, { ...activeKey, state: 'retiring', retiring_at: '2026-10-02T10:00:00Z' }] }, 201),
    );
    renderApp(`/developer/registrations/${id}`);

    const keys = await section('Client keys');
    const user = userEvent.setup();
    await user.click(await within(keys).findByRole('button', { name: 'Rotate to a new key' }));
    const field = within(keys).getByLabelText(/Next public key/);
    await user.click(field);
    await user.paste(JSON.stringify({ kty: 'RSA', n: 'sXch-Mo_B7E', e: 'AQAB' }));
    await user.click(within(keys).getByRole('button', { name: 'Rotate' }));

    expect(await within(keys).findByRole('status')).toHaveTextContent('The new key is active');
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe(`/api/v1/registrations/${id}/keys`);
    expect(command?.body).toEqual({ public_key: { kty: 'RSA', n: 'sXch-Mo_B7E', e: 'AQAB' } });
  });

  it('says a registration the person does not own is not there, as the API answers', async () => {
    stubFetch((url) => {
      if (url.pathname === '/auth/session') {
        return json(signedIn);
      }
      if (url.pathname === `/api/v1/registrations/${id}`) {
        return new Response(JSON.stringify({ correlation_id: 'c-404' }), {
          status: 404,
          headers: { 'content-type': 'application/problem+json' },
        });
      }
      return undefined;
    });
    renderApp(`/developer/registrations/${id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing exists at this address.');
    expect(screen.queryByRole('heading', { name: 'Client keys' })).not.toBeInTheDocument();
  });

  it('is reached from the list, by its client key', async () => {
    stubFetch((url) => {
      if (url.pathname === '/auth/session') {
        return json(signedIn);
      }
      if (url.pathname === '/api/v1/registrations:mine') {
        return json({ registrations: [billing] });
      }
      return undefined;
    });
    renderApp('/developer/');

    expect(await screen.findByRole('link', { name: 'billing-web' })).toHaveAttribute(
      'href',
      `/developer/registrations/${id}`,
    );
  });
});
