import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';

import { messages, type Locale } from '@/core/i18n/messages';

export function renderWithIntl(ui: ReactElement, locale: Locale = 'en'): RenderResult {
  return render(
    <IntlProvider locale={locale} messages={messages[locale]} defaultLocale="en">
      {ui}
    </IntlProvider>,
  );
}
