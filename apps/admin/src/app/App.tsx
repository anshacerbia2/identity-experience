import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { type ReactElement, useEffect, useState } from 'react';
import { IntlProvider } from 'react-intl';

import { messages } from '@/core/i18n/messages';
import { selectLocale, selectTheme, usePreferences } from '@/core/preferences/preferences-store';
import { createQueryClient } from '@/core/query/query-client';
import { routeTree } from '@/routeTree.gen';

const router = createRouter({ routeTree, defaultPreload: 'viewport', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// The document follows the preferences: the theme is an attribute on <html>, which is where the
// token layer scopes its themes (STD-GLB-FE-005 §3.5), and lang follows the locale so assistive
// technology pronounces the page in the language it is written in.
function useDocumentPreferences(): void {
  const theme = usePreferences(selectTheme);
  const locale = usePreferences(selectLocale);
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
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
