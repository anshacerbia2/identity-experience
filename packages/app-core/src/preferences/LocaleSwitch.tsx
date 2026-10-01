import type { ReactElement } from 'react';

import { Button, Icon } from '@identity-experience/ui';

import styles from './LocaleSwitch.module.scss';
import { locales, selectLocale, usePreferences } from './preferences-store';
import { useCoreMessage } from '../i18n/CoreMessage';

// The locale codes are shown as they are, EN and ID, which reads the same in every language and is
// therefore not a translatable string.
export function LocaleSwitch(): ReactElement {
  const locale = usePreferences(selectLocale);
  const setLocale = usePreferences((state) => state.setLocale);
  const t = useCoreMessage();
  return (
    <div className={styles['locale']} role="group" aria-label={t('shell.locale.label')}>
      <span className={styles['localeIcon']} aria-hidden="true">
        <Icon name="globe" />
      </span>
      {locales.map((code) => (
        <Button
          key={code}
          variant="ghost"
          size="sm"
          pressed={code === locale}
          onClick={() => {
            setLocale(code);
          }}
          lang={code}
        >
          {code.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
