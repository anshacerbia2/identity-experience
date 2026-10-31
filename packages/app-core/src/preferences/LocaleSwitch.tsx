import type { ReactElement } from 'react';

import { ButtonBase } from '@identity-experience/ui';

import { locales, selectLocale, usePreferences } from './preferences-store';
import styles from './Preferences.module.scss';
import { useCoreMessage } from '../i18n/CoreMessage';

// The locale codes are shown as they are, EN and ID, which reads the same in every language and is
// therefore not a translatable string.
export function LocaleSwitch(): ReactElement {
  const locale = usePreferences(selectLocale);
  const setLocale = usePreferences((state) => state.setLocale);
  const t = useCoreMessage();
  return (
    <div className={styles['locale']} role="group" aria-label={t('shell.locale.label')}>
      {locales.map((code) => (
        <ButtonBase
          key={code}
          className={styles['code'] ?? ''}
          pressed={code === locale}
          onClick={() => {
            setLocale(code);
          }}
          lang={code}
        >
          {code.toUpperCase()}
        </ButtonBase>
      ))}
    </div>
  );
}
