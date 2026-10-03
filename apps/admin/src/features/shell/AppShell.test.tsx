import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, renderApp, stubFetch } from '@/test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell sign-in notices', () => {
  it('says a refused sign-in failed', async () => {
    stubFetch(() => json({ authenticated: false }));
    renderApp('/?sign-in=failed');
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in did not complete');
  });

  it('says Keycloak could not be reached, which is worth simply trying again', async () => {
    stubFetch(() => json({ authenticated: false }));
    renderApp('/?sign-in=unavailable');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Keycloak could not be reached');
    expect(alert).not.toHaveTextContent('service log');
  });

  it('says nothing for a marker it does not know', async () => {
    stubFetch(() => json({ authenticated: false }));
    renderApp('/?sign-in=pwned');
    await screen.findByRole('link', { name: 'Sign in' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('AppShell navigation', () => {
  it('groups pages by what they act on, and names no backend', async () => {
    stubFetch(() => json({ authenticated: false }));
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const groups = within(nav).getAllByRole('list');
    expect(groups.map((list) => list.getAttribute('aria-labelledby'))).toEqual([
      null,
      'nav-group-identities',
      'nav-group-applications',
      'nav-group-governance',
    ]);
    expect(within(nav).getByRole('list', { name: 'Identities' })).toHaveTextContent(/Principals.*Workloads/);
    expect(within(nav).getByRole('list', { name: 'Applications' })).toHaveTextContent('Registrations');
    expect(within(nav).getByRole('list', { name: 'Governance' })).toHaveTextContent('Approvals');
    expect(nav).not.toHaveTextContent(/keycloak|kernel/i);
  });
});
