import type { ReactElement } from 'react';

import { Button, Icon, Panel } from '@identity-experience/ui';

import { ApiError } from './api-client';
import type { CoreMessageKey } from '../i18n/core-messages';
import { CoreMessage } from '../i18n/CoreMessage';
import { stepUpHref } from '../session/session';

// ApiErrorPanel states why a read failed, in words, and the reference an operator quotes to find
// the request in the logs. It never shows the server's detail text: a message is chosen here from
// the status, so nothing the server says is rendered as if it were the application's own.
export function ApiErrorPanel({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
}): ReactElement {
  const apiError = error instanceof ApiError ? error : null;
  // A read can be challenged too: a provider route needs two factors (ADR-IAM-004). The way forward
  // is a sign-in at that level, not a retry.
  if (apiError !== null && apiError.stepUp !== null) {
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return (
      <Panel.Root role="alert">
        <Panel.Header>
          <Panel.Title>
            <CoreMessage id="api.stepUp" />
          </Panel.Title>
        </Panel.Header>
        <Panel.Body>
          <a href={stepUpHref(here, apiError.stepUp)}>
            <CoreMessage id="api.stepUp.action" />
          </a>
        </Panel.Body>
      </Panel.Root>
    );
  }
  const status = apiError?.status ?? 0;
  let explanation: CoreMessageKey = 'api.error.other';
  if (status === 403) {
    explanation = 'api.error.forbidden';
  } else if (status === 404) {
    explanation = 'api.error.notFound';
  } else if (status === 0 || status === 502 || status === 503 || status === 504) {
    explanation = 'api.error.unavailable';
  }
  return (
    <Panel.Root role="alert">
      <Panel.Header>
        <Panel.Title>
          <CoreMessage id="api.error.title" />
        </Panel.Title>
        <Panel.Description>
          <CoreMessage id={explanation} values={{ status }} />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        {apiError?.correlationId ? (
          <p>
            <CoreMessage id="api.error.correlation" values={{ id: apiError.correlationId }} />
          </p>
        ) : null}
        {onRetry === undefined ? null : (
          <Button variant="secondary" size="sm" icon={<Icon name="pulse" />} onClick={onRetry}>
            <CoreMessage id="api.retry" />
          </Button>
        )}
      </Panel.Body>
    </Panel.Root>
  );
}
