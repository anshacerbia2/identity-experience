import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { Locale } from '../i18n/messages';

// Per-viewer preferences: theme and language. The only thing this application keeps in browser
// storage, and it is not a credential (STD-GLB-FE-003 §3.4 forbids those, and nothing else).

export type Theme = 'dark' | 'light';

interface PreferencesState {
  readonly theme: Theme;
  readonly locale: Locale;
  readonly setTheme: (theme: Theme) => void;
  readonly setLocale: (locale: Locale) => void;
}

// Storage that never throws: a private window or blocked site data must leave the application
// working on its defaults rather than failing to start.
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Preferences are a convenience; losing one is not an error.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // As above.
    }
  },
};

const initialLocale = (): Locale =>
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('id') ? 'id' : 'en';

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'dark',
      locale: initialLocale(),
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'scnx-iam-preferences',
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ theme, locale }) => ({ theme, locale }),
    },
  ),
);

export const selectTheme = (state: PreferencesState): Theme => state.theme;
export const selectLocale = (state: PreferencesState): Locale => state.locale;
