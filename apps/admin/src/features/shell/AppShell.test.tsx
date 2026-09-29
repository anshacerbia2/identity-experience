import { screen } from '@testing-library/react';
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
