import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { Owner, Registration } from '@identity-experience/app-core/domain/registration';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// A registration's owners in the Admin Portal (TDD-identity-experience-003 §Registration Ownership):
// granted and revoked by a provider with a reason, and offered only where the API accepts it.

const csrfToken = 'csrf-from-the-session';
const signedIn = {
  authenticated: true,
  principalId: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  displayName: 'Ada Admin',
  acr: '1',
  authTime: null,
  idleExpiresAt: '2026-09-29T10:30:00Z',
  absoluteExpiresAt: '2026-09-29T18:00:00Z',
  csrfToken,
};
const first = '0192f0e0-1111-7000-8000-00000000000a';
const second = '0192f0e0-1111-7000-8000-00000000000b';
const newcomer = '0192f0e0-1111-7000-8000-00000000000c';

const registration = (state: Registration['state'] = 'active'): Registration => ({
  registration_id: 'r-pay',
  realm: 'scnehaux',
  client_key: 'payroll-web',
  profile: 'confidential',
  audience_class: 'privileged',
  application_authority: 'manual',
  application_ref: 'payroll',
  registered_by: signedIn.principalId,
  signing_algorithm: 'PS256',
  audience: [],
  redirect_uris: ['https://payroll.example/callback'],
  access_token_lifespan: 300,
  state,
  version: 3,
  created_at: '2026-09-28T09:00:00Z',
});

const owner = (principalId: string, extra: Partial<Owner> = {}): Owner => ({
  ownership_id: `o-${principalId.slice(-1)}`,
  registration_id: 'r-pay',
  principal_id: principalId,
  granted_by: signedIn.principalId,
  grant_reason: 'Team lead of payroll',
  granted_at: '2026-09-28T09:00:00Z',
  revoked_at: null,
  revoked_by: null,
  active: true,
  ...extra,
});

function api(options: {
  readonly state?: Registration['state'];
  readonly owners?: readonly Owner[];
  readonly environment?: 'production' | 'non-production';
  readonly command?: (sent: Sent) => Response;
}) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return options.command?.(sent);
    }
    switch (url.pathname) {
      case '/api/v1/registrations/r-pay':
        return json(registration(options.state));
      case '/api/v1/registrations/r-pay/owners':
        return json({ owners: options.owners ?? [owner(first), owner(second)] });
      case '/api/v1/registrations:standing':
        return json({
          provider: true,
          application_developer: false,
          environment: options.environment ?? 'non-production',
        });
      case '/api/v1/registrations/r-pay/keys':
        return json({ keys: [] });
      case '/api/v1/registrations/r-pay/findings':
        return json({ findings: [] });
      case '/api/v1/registrations/r-pay/drift-exceptions':
        return json({ exceptions: [] });
      case '/api/v1/registrations/r-pay/changes':
        return json({ changes: [] });
      default:
        return undefined;
    }
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

async function ownersSection(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: 'Owners', level: 2 });
  return heading.closest('section') as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OwnerManagement', () => {
  it('lists the owners and offers a grant and each revocation', async () => {
    api({});
    const { container } = renderApp('/registrations/r-pay');
    const section = await ownersSection();
    const table = await within(section).findByRole('table', {
      name: 'Owners of this registration, and what each may be offered',
    });
    expect(within(table).getByText(first)).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: `Revoke ${first}` })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: `Revoke ${second}` })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Grant ownership' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('grants ownership with the principal_id, a reason and an Idempotency-Key', async () => {
    const { sent } = api({
      command: () => json({ owners: [owner(first), owner(second), owner(newcomer)] }, 201),
    });
    renderApp('/registrations/r-pay');
    const section = await ownersSection();
    await userEvent.click(await within(section).findByRole('button', { name: 'Grant ownership' }));
    await userEvent.type(within(section).getByRole('textbox', { name: 'Person’s principal_id' }), newcomer);
    await userEvent.type(
      within(section).getByRole('textbox', { name: 'Reason' }),
      'Joins the payroll team as on-call owner.',
    );
    await userEvent.click(within(section).getByRole('button', { name: 'Grant' }));

    expect(await within(section).findByText('Ownership granted.')).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/registrations/r-pay/owners');
    expect(request?.body).toEqual({ principal_id: newcomer });
    expect(request?.headers['x-administrative-reason']).toBe('Joins the payroll team as on-call owner.');
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('retries a grant whose answer was lost under the same key', async () => {
    let calls = 0;
    const { sent } = api({
      command: () => {
        calls += 1;
        return calls === 1
          ? json({ status: 503, detail: 'unavailable' }, 503)
          : json({ owners: [owner(first), owner(second), owner(newcomer)] }, 201);
      },
    });
    renderApp('/registrations/r-pay');
    const section = await ownersSection();
    await userEvent.click(await within(section).findByRole('button', { name: 'Grant ownership' }));
    await userEvent.type(within(section).getByRole('textbox', { name: 'Person’s principal_id' }), newcomer);
    await userEvent.type(
      within(section).getByRole('textbox', { name: 'Reason' }),
      'Joins the payroll team as on-call owner.',
    );
    const grant = within(section).getByRole('button', { name: 'Grant' });
    await userEvent.click(grant);
    await within(section).findByRole('alert');
    await userEvent.click(grant);
    expect(await within(section).findByText('Ownership granted.')).toBeInTheDocument();
    const keys = posts(sent).map((request) => request.headers['idempotency-key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it('refuses a grant that names no identifier before sending', async () => {
    const { sent } = api({});
    renderApp('/registrations/r-pay');
    const section = await ownersSection();
    await userEvent.click(await within(section).findByRole('button', { name: 'Grant ownership' }));
    await userEvent.type(within(section).getByRole('textbox', { name: 'Person’s principal_id' }), 'alice');
    await userEvent.type(
      within(section).getByRole('textbox', { name: 'Reason' }),
      'Joins the payroll team as on-call owner.',
    );
    await userEvent.click(within(section).getByRole('button', { name: 'Grant' }));
    expect(await within(section).findByText('Enter a principal_id: a UUID.')).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);
  });

  it('revokes an ownership with a reason, and shows a refusal with the API sentence', async () => {
    const { sent } = api({
      command: () =>
        json({ status: 409, detail: 'registration: the Principal already owns this registration' }, 409),
    });
    renderApp('/registrations/r-pay');
    const section = await ownersSection();
    await userEvent.click(await within(section).findByRole('button', { name: `Revoke ${first}` }));
    const panel = (await screen.findByRole('heading', { name: 'Revoke ownership' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Reason' }), 'Left the payroll team.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Revoke' }));
    expect(
      await within(panel).findByText(
        'The API said: registration: the Principal already owns this registration',
      ),
    ).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe(`/api/v1/registrations/r-pay/owners/${first}:revoke`);
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(request?.headers['x-administrative-reason']).toBe('Left the payroll team.');
  });

  it('offers no revocation that would leave a production registration fewer than two owners', async () => {
    api({
      environment: 'production',
      owners: [owner(first), owner(second), owner(newcomer, { active: false })],
    });
    renderApp('/registrations/r-pay');
    const section = await ownersSection();
    const table = await within(section).findByRole('table', {
      name: 'Owners of this registration, and what each may be offered',
    });
    expect(within(table).queryByRole('button', { name: `Revoke ${first}` })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: `Revoke ${second}` })).not.toBeInTheDocument();
    // An ownership that confers nothing leaves the active owners as they were.
    expect(within(table).getByRole('button', { name: `Revoke ${newcomer}` })).toBeInTheDocument();
    expect(within(section).getByText(/keeps at least two active owners/)).toBeInTheDocument();
  });

  it('offers no grant on a retired registration, and lists no revoked ownership', async () => {
    api({
      state: 'retired',
      owners: [owner(first), owner(second, { revoked_at: '2026-10-01T00:00:00Z', active: false })],
    });
    renderApp('/registrations/r-pay');
    const section = await ownersSection();
    await within(section).findByText(first);
    expect(within(section).queryByText(second)).not.toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Grant ownership' })).not.toBeInTheDocument();
  });
});
