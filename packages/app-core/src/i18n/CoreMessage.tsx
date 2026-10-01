import type { ReactElement } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import type { CoreMessageKey } from './core-messages';

type Values = Readonly<Record<string, string | number>>;

// CoreMessage renders one of this package's strings. The application's IntlProvider holds them,
// because every application spreads coreMessages into its catalogue; the id is a CoreMessageKey, so
// a shared component cannot name a key only one application defines.
export function CoreMessage({
  id,
  values,
}: {
  readonly id: CoreMessageKey;
  readonly values?: Values;
}): ReactElement {
  return <FormattedMessage id={id} {...(values === undefined ? {} : { values })} />;
}

// useCoreMessage is the same for places a string is needed rather than an element.
export function useCoreMessage(): (id: CoreMessageKey, values?: Values) => string {
  const intl = useIntl();
  return (id, values) => intl.formatMessage({ id }, values);
}
