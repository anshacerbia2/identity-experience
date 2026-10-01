import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { IntlProvider } from 'react-intl';

import {
  selectLocale,
  useDocumentPreferences,
  usePreferences,
} from '@identity-experience/app-core/preferences';
import { createQueryClient } from '@identity-experience/app-core/query';

import { basepath } from '@/core/basepath';
import { messages } from '@/core/i18n/messages';
import { routeTree } from '@/routeTree.gen';

const router = createRouter({ routeTree, basepath, defaultPreload: 'viewport', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function App(): ReactElement {
  const [queryClient] = useState(createQueryClient);
  const locale = usePreferences(selectLocale);
  useDocumentPreferences();
  return (
    <IntlProvider locale={locale} messages={messages[locale]} defaultLocale="en">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
}
