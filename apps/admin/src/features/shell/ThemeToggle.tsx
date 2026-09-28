import type { ReactElement } from 'react';

import { Button, Icon } from '@identity-experience/ui';

import { useMessage } from '@/core/i18n/Message';
import { selectTheme, usePreferences } from '@/core/preferences/preferences-store';

export function ThemeToggle(): ReactElement {
  const theme = usePreferences(selectTheme);
  const setTheme = usePreferences((state) => state.setTheme);
  const t = useMessage();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = t(next === 'dark' ? 'shell.theme.toDark' : 'shell.theme.toLight');
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onClick={() => {
        setTheme(next);
      }}
    >
      <Icon name={next === 'dark' ? 'moon' : 'sun'} />
    </Button>
  );
}
