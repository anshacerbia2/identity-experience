import type { ReactElement } from 'react';

import { Button, Icon, Panel } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import type { MessageKey } from '@/core/i18n/messages';

import { ApiError } from './api-client';

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
  const status = apiError?.status ?? 0;
  let explanation: MessageKey = 'api.error.other';
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
          <Message id="api.error.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id={explanation} values={{ status }} />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        {apiError?.correlationId ? (
          <p>
            <Message id="api.error.correlation" values={{ id: apiError.correlationId }} />
          </p>
        ) : null}
        {onRetry === undefined ? null : (
          <Button variant="secondary" size="sm" icon={<Icon name="pulse" />} onClick={onRetry}>
            <Message id="api.retry" />
          </Button>
        )}
      </Panel.Body>
    </Panel.Root>
  );
}
