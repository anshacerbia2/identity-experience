import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { DriftStatus, Finding, Registration } from '@identity-experience/app-core/domain/registration';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

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
  client_key: 'orders-bff',
  profile: 'confidential',
  audience_class: 'internal',
  application_authority: 'manual',
  application_ref: 'app-orders',
  registered_by: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  signing_algorithm: 'PS256',
  audience: [],
  redirect_uris: ['https://orders.example.com/callback'],
  access_token_lifespan: 240,
  state: 'active',
  version: 2,
  created_at: '2026-09-28T09:00:00Z',
};

const blocked: Finding = {
  finding_id: 'f-blocked',
  registration_id: 'r-bff',
  client_key: 'orders-bff',
  field_class: 'redirect_uris',
  finding_class: 'blocked',
  desired: ['https://orders.example.com/callback'],
  observed: ['https://evil.example/callback'],
  actor: 'kc-user-7',
  changed_at: '2026-09-29T09:00:00Z',
  detected_at: '2026-09-29T09:00:30Z',
  converged_at: null,
};

const stray: Finding = {
  finding_id: 'f-stray',
  registration_id: null,
  client_key: 'console-made',
  finding_class: 'unmanaged',
  desired: null,
  observed: { client_id: 'console-made', enabled: true },
  changed_at: null,
  detected_at: '2026-09-29T09:00:30Z',
  converged_at: null,
};

const drift: DriftStatus = { last_run: null, last_run_findings: [], findings: [blocked, stray] };

function api(registration: Registration, command?: (sent: Sent) => Response) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent) ?? json({ ...registration, state: 'suspended' });
    }
    if (url.pathname === '/api/v1/registrations:drift') {
      return json(drift);
    }
    if (url.pathname === '/api/v1/registrations') {
      return json({ registrations: [registration], next: null });
    }
    if (url.pathname === '/api/v1/registrations/r-bff') {
      return json(registration);
    }
    if (url.pathname === '/api/v1/registrations/r-bff/findings') {
      return json({ findings: [blocked] });
    }
    if (url.pathname === '/api/v1/registrations/r-bff/drift-exceptions') {
      return json({ exceptions: [] });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

async function openForm(action: string, title: string): Promise<HTMLElement> {
  const section = (await screen.findByRole('heading', { name: 'Lifecycle' })).closest(
    'section',
  ) as HTMLElement;
  await userEvent.click(within(section).getByRole('button', { name: action }));
  return (await screen.findByRole('heading', { name: title })).closest('section') as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the registration lifecycle', () => {
  it('offers only a suspension for an active client, and sends it with a reason and the CSRF token', async () => {
    const { sent } = api(bff);
    const { container } = renderApp('/registrations/r-bff');
    const section = (await screen.findByRole('heading', { name: 'Lifecycle' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(section).queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument();

    const panel = await openForm('Suspend', 'Suspend this client');
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(within(panel).getByRole('button', { name: 'Suspend' }));
    expect(await within(panel).findByText(/Write at least 10 characters/)).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);

    await userEvent.type(within(panel).getByRole('textbox', { name: 'Reason' }), 'Its key may have leaked.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('The client is suspended.')).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/registrations/r-bff:suspend');
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
    expect(request?.headers['x-administrative-reason']).toBe('Its key may have leaked.');
    expect(request?.body).toEqual({});
  });

  it('offers a restore and a retirement for a suspended client, and no apply', async () => {
    api({ ...bff, state: 'suspended' });
    renderApp('/registrations/r-bff');
    const section = (await screen.findByRole('heading', { name: 'Lifecycle' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(section).getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Retire' })).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    await screen.findByRole('table', { name: 'Findings for this client' });
    expect(screen.queryByRole('button', { name: 'Apply registered state' })).not.toBeInTheDocument();
  });

  it('retires only once the client key is typed exactly', async () => {
    const { sent } = api({ ...bff, state: 'suspended' }, () => json({ ...bff, state: 'retired' }));
    renderApp('/registrations/r-bff');
    const panel = await openForm('Retire', 'Retire this client');
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'The orders BFF is decommissioned.',
    );
    const confirmation = within(panel).getByRole('textbox', { name: 'Type orders-bff to confirm' });
    await userEvent.type(confirmation, 'orders');
    await userEvent.click(within(panel).getByRole('button', { name: 'Retire' }));
    expect(await within(panel).findByText('Type the client key exactly as shown.')).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);

    await userEvent.type(confirmation, '-bff');
    await userEvent.click(within(panel).getByRole('button', { name: 'Retire' }));
    expect(await screen.findByText('The client is retired.')).toBeInTheDocument();
    expect(posts(sent)[0]?.url.pathname).toBe('/api/v1/registrations/r-bff:retire');
  });

  it("shows the API's refusal of a retirement, naming the registrations that still use it", async () => {
    const resource: Registration = {
      ...bff,
      profile: 'resource',
      client_key: 'orders-api',
      redirect_uris: [],
    };
    api(resource, () =>
      json(
        {
          type: 'https://problems.scnehaux.com/state-transition-refused',
          title: 'The state transition is refused',
          status: 409,
          detail: 'The resource is in the audience of other registrations: orders-bff',
          correlation_id: 'c0ffee00-0000-4000-8000-000000000002',
        },
        409,
      ),
    );
    renderApp('/registrations/r-bff');
    const panel = await openForm('Retire', 'Retire this client');
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'The orders API is decommissioned.',
    );
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Type orders-api to confirm' }),
      'orders-api',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Retire' }));
    expect(
      await within(panel).findByText(
        'The API said: The resource is in the audience of other registrations: orders-bff',
      ),
    ).toBeInTheDocument();
  });

  it("offers nothing for a workload's client", async () => {
    api({ ...bff, profile: 'workload' });
    renderApp('/registrations/r-bff');
    await screen.findByRole('heading', { name: 'orders-bff' });
    expect(screen.queryByRole('heading', { name: 'Lifecycle' })).not.toBeInTheDocument();
  });
});

describe('unmanaged clients', () => {
  it('are counted in the drift summary and beside no registration', async () => {
    api(bff);
    renderApp('/registrations');
    expect(await screen.findByText('1 Keycloak client no registration describes')).toBeInTheDocument();
  });
});
