import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, type RenderResult } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { vi } from 'vitest';

import { messages, type Locale } from '@/core/i18n/messages';
import { createQueryClient } from '@/core/query/query-client';
import { routeTree } from '@/routeTree.gen';

// renderApp renders the whole application, shell and routes included, at a path: what a user sees
// after navigating there. Reads are not retried, so a refusal shows at once.
export function renderApp(path: string, locale: Locale = 'en'): RenderResult {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  // The application's own client, so its handling of a 401 is under test too.
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
  return render(
    <IntlProvider locale={locale} messages={messages[locale]} defaultLocale="en">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

// A fetch stand-in routed by path: the BFF's /auth and /api answered by the test. It records every
// request, so a test can assert what the page asked for.
export type Responder = (url: URL) => Response | undefined;

export function stubFetch(responder: Responder): { readonly requests: URL[] } {
  const requests: URL[] = [];
  const fetchStub = (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    requests.push(url);
    return Promise.resolve(responder(url) ?? new Response(null, { status: 404 }));
  };
  // Undone by vi.unstubAllGlobals() in the test's afterEach.
  vi.stubGlobal('fetch', fetchStub);
  return { requests };
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
