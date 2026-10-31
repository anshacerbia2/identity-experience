import type { ReactElement } from 'react';

import { ButtonBase, Icon, useTheme } from '@identity-experience/ui';

import styles from './Preferences.module.scss';
import { useCoreMessage } from '../i18n/CoreMessage';

// Switches the document between the dark and the light mode. The theme root (ThemeRoot) keeps the
// choice in the preferences store.
export function ThemeToggle(): ReactElement {
  const theme = useTheme();
  const t = useCoreMessage();
  const next = theme.resolvedMode === 'dark' ? 'light' : 'dark';
  const label = t(next === 'dark' ? 'shell.theme.toDark' : 'shell.theme.toLight');
  return (
    <ButtonBase
      className={styles['theme'] ?? ''}
      aria-label={label}
      title={label}
      onClick={() => {
        theme.setMode(next);
      }}
    >
      <Icon name={next === 'dark' ? 'moon' : 'sun'} />
    </ButtonBase>
  );
}
