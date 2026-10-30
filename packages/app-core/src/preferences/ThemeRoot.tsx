import { useState, type ReactElement, type ReactNode } from 'react';

import {
  createThemeStore,
  PLATFORM_THEME,
  ThemeProvider,
  type ThemePreferenceAdapter,
} from '@identity-experience/ui';

import { usePreferences, type Theme } from './preferences-store';

// The document's theme root: the platform's ThemeProvider (`@scnx/core-ui`) on <html>, in the
// scnx-platform theme and the viewer's mode. It writes `data-scnx-theme` and
// `data-scnx-resolved-mode`, the only selector the platform's theme stylesheet answers to
// (STD-UIP-TKN-002 §3.4). index.html carries both with the default mode, so the first paint already
// has tokens: the content security policy allows no inline script that could set them sooner.
//
// The viewer's choice stays in the preferences store, through an adapter (TDD-ui-platform-docs-001
// D6 does the same over a cookie). The applications offer dark and light, dark by default; a stored
// value the store does not know reads as no preference.

const isTheme = (value: unknown): value is Theme => value === 'dark' || value === 'light';

const preference: ThemePreferenceAdapter = {
  read: () => usePreferences.getState().theme,
  write: (mode) => {
    if (isTheme(mode)) {
      usePreferences.getState().setTheme(mode);
    }
  },
  subscribe: (listener) => usePreferences.subscribe(listener),
};

export function ThemeRoot({ children }: { readonly children: ReactNode }): ReactElement {
  const [store] = useState(() => {
    // The preferences store has read localStorage already, synchronously, so the first render is in
    // the stored mode, not the default one for a frame.
    const theme = usePreferences.getState().theme;
    return createThemeStore({
      themeId: PLATFORM_THEME,
      themes: [PLATFORM_THEME],
      defaultMode: 'dark',
      serverHint: { mode: theme, resolvedMode: theme },
      storage: preference,
    });
  });
  return (
    <ThemeProvider themeId={PLATFORM_THEME} store={store} root={document.documentElement}>
      {children}
    </ThemeProvider>
  );
}
