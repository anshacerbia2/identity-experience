import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { ApplicationDeveloper } from '@/domain/principal';
import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// Application developer standing on the Principals page (TDD-identity-experience-003 §Application
// Developers): listed newest first, granted and revoked by a provider, each with a reason.

const signedIn = {
  authenticated: true,
  principalId: '01a0da74-44e7-7000-b600-b464c5cb8cec',
  displayName: 'Ada Admin',
  acr: '1',
  authTime: null,
  idleExpiresAt: '2026-10-01T10:30:00Z',
  absoluteExpiresAt: '2026-10-01T18:00:00Z',
  csrfToken: 'csrf',
};
const dana = '0192f0e0-3333-7000-8000-000000000001';
const grant = (overrides: Partial<ApplicationDeveloper>): ApplicationDeveloper => ({
  grant_id: 'g-1',
  principal_id: dana,
  granted_by: signedIn.principalId,
  grant_reason: 'Builds the orders service',
  granted_at: '2026-10-01T08:00:00Z',
  revoked_at: null,
  revoked_by: null,
  active: true,
  ...overrides,
});

function api(developers: readonly ApplicationDeveloper[], command?: (sent: Sent) => Response) {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(signedIn);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === '/api/v1/principals:dangling') {
      return json({ dangling: [] });
    }
    if (url.pathname === '/api/v1/application-developers') {
      return json({ developers });
    }
    return undefined;
  });
}

const posts = (sent: readonly Sent[]): Sent[] => sent.filter((request) => request.method === 'POST');

async function section(): Promise<HTMLElement> {
  return (await screen.findByRole('heading', { name: 'Application developers' })).closest(
    'section',
  ) as HTMLElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('application developers', () => {
  it('lists the grants, and offers revocation only on an active one', async () => {
    api([
      grant({}),
      grant({
        grant_id: 'g-0',
        principal_id: 'old',
        revoked_at: '2026-09-01T00:00:00Z',
        revoked_by: 'x',
        revoke_reason: 'Left the team',
        active: false,
      }),
    ]);
    const { container } = renderApp('/principals');

    const developers = await section();
    const table = await within(developers).findByRole('table', { name: 'Application developer grants' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(table).toHaveTextContent('Left the team');
    expect(within(table).getAllByRole('button', { name: /^Revoke / })).toHaveLength(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('grants the standing to a principal_id with a reason', async () => {
    const { sent } = api([], () => json({ developers: [grant({})] }, 201));
    renderApp('/principals');

    const developers = await section();
    const user = userEvent.setup();
    await user.click(within(developers).getByRole('button', { name: 'Grant the standing' }));
    await user.type(within(developers).getByRole('textbox', { name: 'principal_id' }), 'not-a-uuid');
    await user.type(within(developers).getByLabelText(/Reason/), 'Builds the orders service');
    await user.click(within(developers).getByRole('button', { name: 'Grant' }));
    expect(await within(developers).findByText('A principal_id is a UUID.')).toBeInTheDocument();
    expect(posts(sent)).toHaveLength(0);

    await user.clear(within(developers).getByRole('textbox', { name: 'principal_id' }));
    await user.type(within(developers).getByRole('textbox', { name: 'principal_id' }), dana);
    await user.click(within(developers).getByRole('button', { name: 'Grant' }));
    expect(await within(developers).findByText('The standing is granted.')).toBeInTheDocument();
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe('/api/v1/application-developers');
    expect(command?.body).toEqual({ principal_id: dana });
    expect(command?.headers['x-administrative-reason']).toBe('Builds the orders service');
  });

  it('revokes an active grant with a reason, and shows a refusal in the API’s words', async () => {
    const { sent } = api(
      [grant({})],
      () =>
        new Response(
          JSON.stringify({ detail: 'registration: the Principal holds no application developer standing' }),
          {
            status: 404,
            headers: { 'content-type': 'application/problem+json' },
          },
        ),
    );
    renderApp('/principals');

    const developers = await section();
    const user = userEvent.setup();
    await user.click(await within(developers).findByRole('button', { name: `Revoke ${dana}` }));
    await user.type(within(developers).getByLabelText(/Reason/), 'Moved to another team');
    await user.click(within(developers).getByRole('button', { name: 'Revoke' }));

    expect(await within(developers).findByRole('alert')).toHaveTextContent(
      'holds no application developer standing',
    );
    expect(posts(sent)[0]?.url.pathname).toBe(`/api/v1/application-developers/${dana}:revoke`);
  });
});
