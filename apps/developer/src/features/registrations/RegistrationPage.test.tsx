import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type {
  ClientKey,
  Owner,
  Registration,
  RegistrationChange,
} from '@identity-experience/app-core/domain/registration';

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

const moved = ['https://billing.example.com/callback', 'https://pay.example.com/callback'];

const change = (overrides: Partial<RegistrationChange> = {}): RegistrationChange => ({
  change_id: 'c-1',
  registration_id: id,
  client_key: 'billing-web',
  base_version: 3,
  kind: 'redirect_uris',
  previous_redirect_uris: ['https://billing.example.com/callback'],
  redirect_uris: moved,
  previous_audience: null,
  audience: null,
  approval_required: true,
  proposed_by: me,
  proposal_reason: 'Payments move to their own host',
  proposed_at: '2026-10-01T09:00:00Z',
  state: 'proposed',
  decided_by: null,
  decided_at: null,
  ...overrides,
});

function api(
  registration: Registration,
  command?: (sent: Sent) => Response,
  changes: readonly RegistrationChange[] = [],
) {
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
    if (url.pathname === `/api/v1/registrations/${id}/changes`) {
      return json({ changes });
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
    // In the record, and as the registered set the changes start from.
    expect(screen.getAllByText('https://billing.example.com/callback')).toHaveLength(2);

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

  it('proposes the whole next set of redirect URIs, against the version read, with a reason', async () => {
    const { sent } = api(billing, () => json(change({ state: 'applied', approval_required: false }), 201));
    renderApp(`/developer/registrations/${id}`);

    const changes = await section('Redirect URIs and audience');
    const user = userEvent.setup();
    await user.click(await within(changes).findByRole('button', { name: 'Propose redirect URIs' }));
    const field = within(changes).getByLabelText(/Redirect URIs, one per line/);
    await user.type(field, '\n\n  https://pay.example.com/callback  ');
    await user.type(within(changes).getByLabelText(/Reason/), 'Payments move to their own host');
    await user.click(within(changes).getByRole('button', { name: 'Propose' }));

    expect(await within(changes).findByRole('status')).toHaveTextContent('The redirect URIs are changed.');
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe(`/api/v1/registrations/${id}/changes`);
    expect(command?.body).toEqual({ redirect_uris: moved, expected_version: 3 });
    expect(command?.headers['x-administrative-reason']).toBe('Payments move to their own host');
  });

  it('says the registration changed when the version read is stale', async () => {
    api(
      billing,
      () =>
        new Response(JSON.stringify({ type: 'https://problems.scnehaux.com/version-conflict', title: 'x' }), {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        }),
    );
    renderApp(`/developer/registrations/${id}`);

    const changes = await section('Redirect URIs and audience');
    const user = userEvent.setup();
    await user.click(await within(changes).findByRole('button', { name: 'Propose redirect URIs' }));
    await user.type(
      within(changes).getByLabelText(/Redirect URIs, one per line/),
      '\nhttps://pay.example.com/callback',
    );
    await user.type(within(changes).getByLabelText(/Reason/), 'Payments move to their own host');
    await user.click(within(changes).getByRole('button', { name: 'Propose' }));

    expect(await within(changes).findByRole('alert')).toHaveTextContent(
      'The registration changed since you read it.',
    );
  });

  it('shows a waiting change as its before and after; its proposer withdraws it and approves nothing', async () => {
    const { sent } = api(billing, () => json(change({ state: 'withdrawn' })), [
      change(),
      change({
        change_id: 'c-0',
        state: 'rejected',
        decided_by: '44444444-4444-4444-8444-444444444444',
        decision_reason: 'Use the existing host',
        decided_at: '2026-09-20T10:00:00Z',
        redirect_uris: ['https://x.example.com/cb'],
      }),
    ]);
    renderApp(`/developer/registrations/${id}`);

    const changes = await section('Redirect URIs and audience');
    expect(await within(changes).findByText('Waiting for approval')).toBeInTheDocument();
    expect(within(changes).getByText('Added')).toBeInTheDocument();
    expect(within(changes).getByText('Kept')).toBeInTheDocument();
    expect(within(changes).getByText(/A provider other than its proposer approves it/)).toBeInTheDocument();
    expect(within(changes).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(within(changes).queryByRole('button', { name: 'Propose redirect URIs' })).not.toBeInTheDocument();
    expect(within(changes).queryByRole('button', { name: 'Propose an audience' })).not.toBeInTheDocument();
    const history = within(changes).getByRole('table', { name: 'Decided changes' });
    expect(history).toHaveTextContent('Rejected');
    expect(history).toHaveTextContent('Use the existing host');

    const user = userEvent.setup();
    await user.click(within(changes).getByRole('button', { name: 'Withdraw' }));
    await user.type(within(changes).getByLabelText(/Reason/), 'Payments stay where they are');
    const submit = within(changes)
      .getAllByRole('button', { name: 'Withdraw' })
      .find((button) => button.getAttribute('type') === 'submit');
    await user.click(submit as HTMLElement);

    expect(await within(changes).findByRole('status')).toHaveTextContent('The change is withdrawn.');
    const [command] = posts(sent);
    expect(command?.url.pathname).toBe(`/api/v1/registrations/${id}/changes/c-1:withdraw`);
  });
  // TDD-identity-experience-004 §Audience Changes, on TDD-identity-control-003 §Registration Changes.
  describe('audience changes', () => {
    const audienceChange = (overrides: Partial<RegistrationChange> = {}): RegistrationChange =>
      change({
        kind: 'audience',
        previous_redirect_uris: null,
        redirect_uris: null,
        previous_audience: ['billing-api'],
        audience: ['billing-api', 'ledger-api'],
        ...overrides,
      });

    it('shows the registered audience, and proposes the whole next one with the version read and a reason', async () => {
      const { sent } = api(billing, () =>
        json(audienceChange({ state: 'applied', approval_required: false }), 201),
      );
      const { container } = renderApp(`/developer/registrations/${id}`);

      const changes = await section('Redirect URIs and audience');
      expect(within(changes).getByText('Audience registered now')).toBeInTheDocument();
      expect(within(changes).getByText('billing-api')).toBeInTheDocument();
      const user = userEvent.setup();
      await user.click(await within(changes).findByRole('button', { name: 'Propose an audience' }));
      const field = within(changes).getByLabelText(/Resources, one client_key per line/);
      expect(field).toHaveValue('billing-api');
      await user.type(field, '\n\n  ledger-api  ');
      await user.type(within(changes).getByLabelText(/Reason/), 'Billing reads the ledger');
      expect(within(changes).getByText(/Removing a resource is always allowed/)).toBeInTheDocument();
      expect(await axe(container)).toHaveNoViolations();
      await user.click(within(changes).getByRole('button', { name: 'Propose' }));

      expect(await within(changes).findByRole('status')).toHaveTextContent('The audience is changed.');
      const [command] = posts(sent);
      expect(command?.url.pathname).toBe(`/api/v1/registrations/${id}/changes`);
      // One kind per change, never both: the API refuses a body naming redirect_uris and audience.
      expect(command?.body).toEqual({ audience: ['billing-api', 'ledger-api'], expected_version: 3 });
      expect(command?.headers['x-administrative-reason']).toBe('Billing reads the ledger');
      expect(command?.headers['x-csrf-token']).toBe(csrfToken);
    });

    it('sends an emptied audience as [], a change to no resource', async () => {
      const { sent } = api(billing, () =>
        json(audienceChange({ audience: [], state: 'proposed', approval_required: true }), 201),
      );
      renderApp(`/developer/registrations/${id}`);

      const changes = await section('Redirect URIs and audience');
      const user = userEvent.setup();
      await user.click(await within(changes).findByRole('button', { name: 'Propose an audience' }));
      await user.clear(within(changes).getByLabelText(/Resources, one client_key per line/));
      await user.type(within(changes).getByLabelText(/Reason/), 'Billing no longer calls the API');
      await user.click(within(changes).getByRole('button', { name: 'Propose' }));

      expect(await within(changes).findByRole('status')).toHaveTextContent(
        'The change is proposed. It waits for a provider other than you.',
      );
      expect(posts(sent)[0]?.body).toEqual({ audience: [], expected_version: 3 });
    });

    it('shows the API’s refusal of a resource the owner does not own in its own words', async () => {
      api(
        billing,
        () =>
          new Response(
            JSON.stringify({
              type: 'https://problems.scnehaux.com/forbidden',
              title: 'The operation is forbidden',
              status: 403,
              detail: 'An owner adds to an audience only resources it owns',
            }),
            { status: 403, headers: { 'content-type': 'application/problem+json' } },
          ),
      );
      renderApp(`/developer/registrations/${id}`);

      const changes = await section('Redirect URIs and audience');
      const user = userEvent.setup();
      await user.click(await within(changes).findByRole('button', { name: 'Propose an audience' }));
      await user.type(within(changes).getByLabelText(/Resources, one client_key per line/), '\norders-api');
      await user.type(within(changes).getByLabelText(/Reason/), 'Billing reads orders');
      await user.click(within(changes).getByRole('button', { name: 'Propose' }));

      expect(await within(changes).findByRole('alert')).toHaveTextContent(
        'An owner adds to an audience only resources it owns',
      );
    });

    it('labels an open audience change by its kind and offers no second proposal', async () => {
      api(billing, undefined, [audienceChange()]);
      renderApp(`/developer/registrations/${id}`);

      const changes = await section('Redirect URIs and audience');
      expect(await within(changes).findByText('Waiting for approval')).toBeInTheDocument();
      expect(within(changes).getByText('Audience')).toBeInTheDocument();
      expect(within(changes).getByText('ledger-api')).toBeInTheDocument();
      expect(within(changes).getByText('Added')).toBeInTheDocument();
      for (const name of ['Propose redirect URIs', 'Propose an audience']) {
        expect(within(changes).queryByRole('button', { name })).not.toBeInTheDocument();
      }
    });

    it('offers a workload’s owner an audience change and no redirect URIs', async () => {
      api({ ...billing, profile: 'workload', redirect_uris: [] });
      renderApp(`/developer/registrations/${id}`);

      const changes = await section('Audience');
      expect(await within(changes).findByRole('button', { name: 'Propose an audience' })).toBeInTheDocument();
      expect(
        within(changes).queryByRole('button', { name: 'Propose redirect URIs' }),
      ).not.toBeInTheDocument();
      expect(within(changes).queryByText('Redirect URIs registered now')).not.toBeInTheDocument();
    });

    it('offers no change on a suspended client, and has no section for a resource', async () => {
      api({ ...billing, state: 'suspended' });
      const { unmount } = renderApp(`/developer/registrations/${id}`);
      const changes = await section('Redirect URIs and audience');
      expect(within(changes).queryByRole('button', { name: 'Propose an audience' })).not.toBeInTheDocument();
      unmount();

      api({ ...billing, profile: 'resource', audience: [], redirect_uris: [], lifetime_class: 'L1' });
      renderApp(`/developer/registrations/${id}`);
      expect(await screen.findByRole('heading', { name: 'billing-web' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /audience/i })).not.toBeInTheDocument();
    });
  });

  // ADR-IAM-003 §5.9, TDD-identity-experience-004 §Lifetime-Class Changes: a resource's owner proposes
  // its next lifetime class, each class shown with what it means.
  describe('lifetime-class changes', () => {
    const resource: Registration = {
      ...billing,
      client_key: 'billing-api',
      profile: 'resource',
      audience: [],
      redirect_uris: [],
      lifetime_class: 'L1',
    };
    const lifetimeChange = (overrides: Partial<RegistrationChange> = {}): RegistrationChange =>
      change({
        client_key: 'billing-api',
        kind: 'lifetime_class',
        previous_redirect_uris: null,
        redirect_uris: null,
        previous_lifetime_class: 'L1',
        lifetime_class: 'L0',
        ...overrides,
      });

    it('shows the registered class, and proposes the next one with the version read and a reason', async () => {
      const { sent } = api(resource, () =>
        json(lifetimeChange({ state: 'applied', approval_required: false }), 201),
      );
      const { container } = renderApp(`/developer/registrations/${id}`);

      const changes = await section('Lifetime class');
      expect(within(changes).getByText('Lifetime class registered now')).toBeInTheDocument();
      expect(
        within(changes).getByText(
          'L1: token valid 9 minutes, a revocation takes effect within about 10 minutes',
        ),
      ).toBeInTheDocument();
      for (const name of ['Propose redirect URIs', 'Propose an audience']) {
        expect(within(changes).queryByRole('button', { name })).not.toBeInTheDocument();
      }
      const user = userEvent.setup();
      await user.click(await within(changes).findByRole('button', { name: 'Propose a lifetime class' }));
      const field = within(changes).getByLabelText(/^Lifetime class/);
      expect(field).toHaveValue('L1');
      expect(within(changes).getAllByRole('option')).toHaveLength(4);
      await user.selectOptions(field, 'L0');
      await user.type(within(changes).getByLabelText(/Reason/), 'The API now moves funds');
      expect(within(changes).getByText(/A longer class is a longer window/)).toBeInTheDocument();
      expect(await axe(container)).toHaveNoViolations();
      await user.click(within(changes).getByRole('button', { name: 'Propose' }));

      expect(await within(changes).findByRole('status')).toHaveTextContent('The lifetime class is changed.');
      const [command] = posts(sent);
      expect(command?.url.pathname).toBe(`/api/v1/registrations/${id}/changes`);
      expect(command?.body).toEqual({ lifetime_class: 'L0', expected_version: 3 });
      expect(command?.headers['x-administrative-reason']).toBe('The API now moves funds');
    });

    it('shows an open lifetime-class change from one class to the other, and offers no second proposal', async () => {
      api(resource, undefined, [lifetimeChange()]);
      renderApp(`/developer/registrations/${id}`);

      const changes = await section('Lifetime class');
      expect(await within(changes).findByText('Waiting for approval')).toBeInTheDocument();
      expect(within(changes).getByText('From')).toBeInTheDocument();
      expect(
        within(changes).getByText(
          'L0: token valid 4 minutes, a revocation takes effect within about 5 minutes',
        ),
      ).toBeInTheDocument();
      expect(
        within(changes).queryByRole('button', { name: 'Propose a lifetime class' }),
      ).not.toBeInTheDocument();
    });
  });
});
