import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, type RenderResult } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { vi } from 'vitest';

import { createQueryClient } from '@identity-experience/app-core/query';

import { basepath } from '@/core/basepath';
import { messages, type Locale } from '@/core/i18n/messages';
import { routeTree } from '@/routeTree.gen';

// renderApp renders the whole application, shell and routes included, at a path: what a user sees
// after navigating there. The path is the browser's, base path included (/account/). Reads are not
// retried, so a refusal shows at once.
export function renderApp(path: string, locale: Locale = 'en'): RenderResult {
  const router = createRouter({
    routeTree,
    basepath,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
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
export interface Sent {
  readonly url: URL;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export type Responder = (url: URL, sent: Sent) => Response | undefined;

export function stubFetch(responder: Responder): { readonly requests: URL[]; readonly sent: Sent[] } {
  const requests: URL[] = [];
  const sent: Sent[] = [];
  const fetchStub = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
    const request: Sent = {
      url,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body,
    };
    requests.push(url);
    sent.push(request);
    return Promise.resolve(responder(url, request) ?? new Response(null, { status: 404 }));
  };
  // Undone by vi.unstubAllGlobals() in the test's afterEach.
  vi.stubGlobal('fetch', fetchStub);
  return { requests, sent };
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
