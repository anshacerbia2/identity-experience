import type { ReactElement } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import type { MessageKey } from './messages';

type Values = Readonly<Record<string, string | number>>;

// Message renders a translated string. Its id is a MessageKey, so a key that does not exist in the
// catalogue does not compile.
export function Message({ id, values }: { readonly id: MessageKey; readonly values?: Values }): ReactElement {
  return <FormattedMessage id={id} {...(values === undefined ? {} : { values })} />;
}

// useMessage is the same for places a string is needed rather than an element: aria-label,
// title, document.title.
export function useMessage(): (id: MessageKey, values?: Values) => string {
  const intl = useIntl();
  return (id, values) => intl.formatMessage({ id }, values);
}
