import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type {
  DriftException,
  DriftStatus,
  Finding,
  Registration,
} from '@identity-experience/app-core/domain/registration';

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

const web: Registration = {
  registration_id: 'r-web',
  realm: 'scnehaux',
  client_key: 'web',
  profile: 'public',
  audience_class: 'internal',
  application_authority: 'manual',
  application_ref: 'app-web',
  registered_by: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  signing_algorithm: 'PS256',
  audience: [],
  redirect_uris: ['https://app.example.com/callback'],
  access_token_lifespan: 240,
  state: 'active',
  version: 2,
  created_at: '2026-09-28T09:00:00Z',
};

const blocked: Finding = {
  finding_id: 'f-blocked',
  registration_id: 'r-web',
  client_key: 'web',
  field_class: 'redirect_uris',
  finding_class: 'blocked',
  desired: ['https://app.example.com/callback'],
  observed: ['https://evil.example/callback'],
  actor: 'kc-user-7',
  changed_at: '2026-09-29T09:00:00Z',
  detected_at: '2026-09-29T09:00:30Z',
  converged_at: null,
};

const repaired: Finding = {
  ...blocked,
  finding_id: 'f-repaired',
  field_class: 'token_lifespan',
  finding_class: 'repaired',
  converged_at: '2026-09-29T09:00:42Z',
};

const drift: DriftStatus = { last_run: null, last_run_findings: [], findings: [blocked] };

const inForce: DriftException = {
  exception_id: 'x-in-force',
  registration_id: 'r-web',
  field_class: 'redirect_uris',
  actor: 'kc-user-7',
  reason: 'Emergency redirect for the partner cut-over.',
  granted_by: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  granted_at: '2026-09-29T10:00:00Z',
  expires_at: '2099-01-01T00:00:00Z',
};

const expired: DriftException = {
  ...inForce,
  exception_id: 'x-expired',
  field_class: 'token_lifespan',
  reason: 'Load test needed a longer token.',
  granted_at: '2026-01-01T10:00:00Z',
  expires_at: '2026-01-01T14:00:00Z',
};

interface Api {
  readonly registration?: Registration;
  readonly exceptions?: readonly DriftException[];
  readonly command?: (sent: Sent) => Response | undefined;
}

function api({ registration = web, exceptions = [], command }: Api = {}) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent) ?? json({ run: null, status: drift });
    }
    if (url.pathname === '/api/v1/registrations:drift') {
      return json(drift);
    }
    if (url.pathname === '/api/v1/registrations') {
      return json({ registrations: [registration], next: null });
    }
    if (url.pathname === '/api/v1/registrations/r-web') {
      return json(registration);
    }
    if (url.pathname === '/api/v1/registrations/r-web/findings') {
      return json({ findings: [blocked, repaired] });
    }
    if (url.pathname === '/api/v1/registrations/r-web/drift-exceptions') {
      return json({ exceptions });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('running a sweep', () => {
  it('asks for a sweep with the session CSRF token, and says when another is already running', async () => {
    const { sent } = api({ command: () => json({ run: null, status: drift, deferred: true }) });
    renderApp('/registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Run a sweep now' }));
    expect(await screen.findByText(/Another sweep is already running/)).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/registrations:reconcile');
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
    expect(request?.body).toEqual({});
  });
});

describe('applying the registered state', () => {
  it('is offered only for a finding the sweep will not settle', async () => {
    api();
    renderApp('/registrations/r-web');
    const table = await screen.findByRole('table', { name: 'Findings for this client' });
    const rows = within(table).getAllByRole('row');
    expect(
      within(rows[1] as HTMLElement).getByRole('button', { name: 'Apply registered state' }),
    ).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
  });

  it('requires a reason before anything is sent', async () => {
    const { sent } = api();
    renderApp('/registrations/r-web');
    await userEvent.click(await screen.findByRole('button', { name: 'Apply registered state' }));
    const form = await screen.findByRole('heading', { name: 'Apply the registered state' });
    const panel = form.closest('section') as HTMLElement;
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply registered state' }));
    expect(await within(panel).findByText(/Write at least 10 characters/)).toBeInTheDocument();
    expect(within(panel).getByRole('textbox', { name: 'Reason' })).toHaveAttribute('aria-invalid', 'true');
    expect(posts(sent)).toHaveLength(0);
  });

  it('refuses characters a header cannot carry, before sending', async () => {
    const { sent } = api();
    renderApp('/registrations/r-web');
    await userEvent.click(await screen.findByRole('button', { name: 'Apply registered state' }));
    const panel = (await screen.findByRole('heading', { name: 'Apply the registered state' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'Rollback approved ✅ by ops',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply registered state' }));
    expect(await within(panel).findByText(/common punctuation only/)).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);
  });

  it('sends the finding and the reason as one line, then says it was applied', async () => {
    const { sent } = api();
    const { container } = renderApp('/registrations/r-web');
    await userEvent.click(await screen.findByRole('button', { name: 'Apply registered state' }));
    const panel = (await screen.findByRole('heading', { name: 'Apply the registered state' })).closest(
      'section',
    ) as HTMLElement;
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'Console change was not approved.{enter}Restoring the registered URI.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply registered state' }));

    expect(await screen.findByText(/The registered state was applied/)).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/registrations:reconcile');
    expect(request?.body).toEqual({ findings: ['f-blocked'] });
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
    expect(request?.headers['x-administrative-reason']).toBe(
      'Console change was not approved. Restoring the registered URI.',
    );
    expect(screen.queryByRole('heading', { name: 'Apply the registered state' })).not.toBeInTheDocument();
  });

  it('shows the API refusal attributed to the API, with the reference', async () => {
    api({
      command: () =>
        json(
          {
            type: 'https://problems.scnehaux.com/validation-failed',
            title: 'The request is invalid',
            status: 400,
            detail: 'reconcile: the finding is not an open blocked, unattributed or missing finding',
            correlation_id: 'c0ffee00-0000-4000-8000-000000000001',
          },
          400,
        ),
    });
    renderApp('/registrations/r-web');
    await userEvent.click(await screen.findByRole('button', { name: 'Apply registered state' }));
    const panel = (await screen.findByRole('heading', { name: 'Apply the registered state' })).closest(
      'section',
    ) as HTMLElement;
    await userEvent.type(
      within(panel).getByRole('textbox', { name: 'Reason' }),
      'Restoring the registered URI.',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply registered state' }));
    expect(await within(panel).findByText('The Identity Control API refused this.')).toBeInTheDocument();
    expect(
      within(panel).getByText(
        'The API said: reconcile: the finding is not an open blocked, unattributed or missing finding',
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText('Reference: c0ffee00-0000-4000-8000-000000000001')).toBeInTheDocument();
  });
});

describe('granting a drift exception', () => {
  it('offers only what the API accepts and sends it with the CSRF token', async () => {
    const { sent } = api({
      command: (request) =>
        request.url.pathname.endsWith('/drift-exceptions')
          ? json(
              {
                exception_id: 'x',
                registration_id: 'r-web',
                field_class: 'token_lifespan',
                actor: 'kc-user-7',
                reason: 'r',
                granted_by: 'p',
                granted_at: '2026-09-29T10:00:00Z',
                expires_at: '2026-09-29T14:00:00Z',
              },
              201,
            )
          : undefined,
    });
    renderApp('/registrations/r-web');
    await userEvent.click(await screen.findByRole('button', { name: 'Grant a drift exception' }));

    const field = screen.getByRole('combobox', { name: 'What may change' });
    expect(
      within(field)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['redirect_uris', 'token_lifespan']);
    const duration = screen.getByRole('combobox', { name: 'For' });
    expect(
      within(duration)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['1', '4', '8', '24']);

    await userEvent.selectOptions(field, 'token_lifespan');
    await userEvent.selectOptions(duration, '4');
    await userEvent.type(screen.getByRole('textbox', { name: 'Keycloak user ID' }), '  kc-user-7 ');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reason' }),
      'Load test needs a longer token today.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Grant exception' }));

    expect(await screen.findByText(/Exception granted until/)).toBeInTheDocument();
    const [request] = posts(sent);
    expect(request?.url.pathname).toBe('/api/v1/registrations/r-web/drift-exceptions');
    expect(request?.headers['x-csrf-token']).toBe(csrfToken);
    expect(request?.body).toEqual({
      field_class: 'token_lifespan',
      actor: 'kc-user-7',
      reason: 'Load test needs a longer token today.',
      duration_seconds: 4 * 3600,
    });
  });

  it('requires the Keycloak user who will make the change', async () => {
    const { sent } = api();
    renderApp('/registrations/r-web');
    await userEvent.click(await screen.findByRole('button', { name: 'Grant a drift exception' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reason' }),
      'Load test needs a longer token today.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Grant exception' }));
    expect(await screen.findByText('Name the Keycloak user who will make the change.')).toBeInTheDocument();
    await waitFor(() => {
      expect(posts(sent)).toHaveLength(0);
    });
  });

  it('is not offered for a registration that is not active, whose exceptions are still listed', async () => {
    api({ registration: { ...web, state: 'suspended' }, exceptions: [expired] });
    renderApp('/registrations/r-web');
    expect(
      await screen.findByRole('table', { name: 'Drift exceptions for this client' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant a drift exception' })).not.toBeInTheDocument();
  });
});

describe('listing drift exceptions', () => {
  it('lists every exception, newest first, and says which are still in force', async () => {
    api({ exceptions: [inForce, expired] });
    const { container } = renderApp('/registrations/r-web');
    const table = await screen.findByRole('table', { name: 'Drift exceptions for this client' });
    const rows = within(table).getAllByRole('row');
    const first = within(rows[1] as HTMLElement);
    const second = within(rows[2] as HTMLElement);
    expect(first.getByText('Emergency redirect for the partner cut-over.')).toBeInTheDocument();
    expect(first.getByText('In force')).toBeInTheDocument();
    expect(second.getByText('Load test needed a longer token.')).toBeInTheDocument();
    expect(second.getByText('Expired')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says when none has been granted', async () => {
    api();
    renderApp('/registrations/r-web');
    expect(
      await screen.findByText('No drift exception has been granted for this client.'),
    ).toBeInTheDocument();
  });

  it('reads the list again once an exception is granted', async () => {
    let listed: readonly DriftException[] = [];
    const { sent } = stubFetch((url, request) => {
      if (url.pathname === '/auth/session') {
        return json(signedIn);
      }
      if (url.pathname === '/api/v1/registrations/r-web') {
        return json(web);
      }
      if (url.pathname === '/api/v1/registrations/r-web/findings') {
        return json({ findings: [] });
      }
      if (url.pathname === '/api/v1/registrations/r-web/drift-exceptions') {
        if (request.method === 'POST') {
          listed = [inForce];
          return json(inForce, 201);
        }
        return json({ exceptions: listed });
      }
      return undefined;
    });
    renderApp('/registrations/r-web');
    await userEvent.click(await screen.findByRole('button', { name: 'Grant a drift exception' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Keycloak user ID' }), 'kc-user-7');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reason' }),
      'Emergency redirect for the partner cut-over.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Grant exception' }));

    const table = await screen.findByRole('table', { name: 'Drift exceptions for this client' });
    expect(within(table).getByText('In force')).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(1);
  });
});
