import type { ReactElement } from 'react';

import { Icon } from '@identity-experience/ui';

import { ApiError } from './api-client';
import styles from './MutationError.module.scss';
import type { CoreMessageKey } from '../i18n/core-messages';
import { CoreMessage } from '../i18n/CoreMessage';
import { stepUpHref } from '../session/session';

// here is where a step-up sign-in returns: the page as the browser shows it, base path included.
const here = (): string => `${window.location.pathname}${window.location.search}${window.location.hash}`;

// MutationError states why a command did not happen. A refusal (4xx) carries the API's own
// sentence, attributed to it: the Identity Control API writes that sentence to name the rule, and
// an operator acting on a refusal needs the rule (TDD-identity-experience-003 §Registration Drift
// Oversight). Anything else is stated in the application's words, with the reference to quote.
export function MutationError({ error }: { readonly error: unknown }): ReactElement {
  const apiError = error instanceof ApiError ? error : null;
  // A step-up challenge is not a refusal: the API asks for a fresher sign-in, and the session is
  // kept. The command is repeated after it.
  if (apiError?.stepUpMaxAge !== null && apiError?.stepUpMaxAge !== undefined) {
    return (
      <div className={styles['root']} role="alert">
        <Icon name="shield" />
        <div className={styles['text']}>
          <p>
            <CoreMessage id="api.stepUp" />
          </p>
          <p>
            <a href={stepUpHref(here(), apiError.stepUpMaxAge)}>
              <CoreMessage id="api.stepUp.action" />
            </a>
          </p>
        </div>
      </div>
    );
  }
  const status = apiError?.status ?? 0;
  let headline: CoreMessageKey = 'api.error.other';
  if (apiError?.isClientError === true && status !== 401) {
    headline = 'api.refused';
  } else if (status === 0 || status === 502 || status === 503 || status === 504) {
    headline = 'api.error.unavailable';
  }
  return (
    <div className={styles['root']} role="alert">
      <Icon name="alert" />
      <div className={styles['text']}>
        <p>
          <CoreMessage id={headline} values={{ status }} />
        </p>
        {apiError?.isClientError === true && apiError.detail !== null ? (
          <p>
            <CoreMessage id="api.said" values={{ detail: apiError.detail }} />
          </p>
        ) : null}
        {apiError?.correlationId ? (
          <p className={styles['reference']}>
            <CoreMessage id="api.error.correlation" values={{ id: apiError.correlationId }} />
          </p>
        ) : null}
      </div>
    </div>
  );
}
