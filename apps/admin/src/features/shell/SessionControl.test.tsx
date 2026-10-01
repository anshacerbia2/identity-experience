import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { SessionControl } from '@identity-experience/app-core/session';

import { renderWithIntl } from '@/test/render';

const signedIn = {
  authenticated: true,
  principalId: 'prn_01TEST',
  displayName: 'Ada Admin',
  acr: '1',
  authTime: '2026-09-29T00:00:00.000Z',
  idleExpiresAt: '2026-09-29T00:30:00.000Z',
  absoluteExpiresAt: '2026-09-29T08:00:00.000Z',
  csrfToken: 'csrf-token-from-the-session',
};

function renderAt(path: string) {
  const router = createRouter({
    routeTree: createRootRoute({ component: SessionControl }),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const respond = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SessionControl', () => {
  it('offers sign-in that returns to the current page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(respond({ authenticated: false }))),
    );
    const { container } = renderAt('/registrations?page=2');
    const link = await screen.findByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute(
      'href',
      `/auth/login?return_to=${encodeURIComponent('/registrations?page=2')}`,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows who is signed in, and signs out with the CSRF token', async () => {
    const fetchMock = vi.fn((input: string) =>
      Promise.resolve(input === '/auth/logout' ? new Response(null, { status: 204 }) : respond(signedIn)),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/');
    expect(await screen.findByText('Ada Admin')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: { 'x-csrf-token': 'csrf-token-from-the-session' },
        }),
      );
    });
  });

  it('states an unavailable session rather than offering sign-in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(respond({}, 503))),
    );
    renderAt('/');
    expect(await screen.findByText('Session unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
