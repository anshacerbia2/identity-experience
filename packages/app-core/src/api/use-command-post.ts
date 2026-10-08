import { useCallback, useRef } from 'react';

import { ApiError, apiPost, type PostOptions } from './api-client';

type ApiPath = `/v1/${string}`;

const requestInProgress = 'https://problems.scnehaux.com/request-in-progress';

// outcomeUnknown is whether a failed command may still have been applied: no answer at all, a 5xx,
// or the API saying the first attempt is still running. A refusal (any other 4xx) is a known outcome,
// as a success is.
export const outcomeUnknown = (error: unknown): boolean =>
  !(error instanceof ApiError) ||
  error.status === 0 ||
  error.status >= 500 ||
  error.type === requestInProgress;

// useCommandPost sends commands with an Idempotency-Key on every one (STD-GLB-001 1.4.0 §Commands
// Require an Idempotency-Key). It keeps one key per distinct request, the path, the body and the
// headers together:
//
// - a retry of the same request after an unknown outcome reuses the key, so the API answers with what
//   the first attempt did instead of doing it twice;
// - once the outcome is known, success or refusal, the key is dropped, so the same values sent again
//   are a new request: granting the person revoked a minute ago grants again rather than replaying
//   the first grant. A key is never reused for a different request (draft-ietf-httpapi-idempotency-
//   key-header-07 §2.2).
//
// A caller that already holds a key for the request, such as a form keyed with useIdempotencyKey,
// passes it in the headers and it is sent unchanged.
export function useCommandPost(): <T>(path: ApiPath, body: unknown, options: PostOptions) => Promise<T> {
  const keys = useRef(new Map<string, string>());
  return useCallback(async <T>(path: ApiPath, body: unknown, options: PostOptions): Promise<T> => {
    if (options.headers?.['idempotency-key'] !== undefined) {
      return apiPost<T>(path, body, options);
    }
    const request = JSON.stringify([path, body, options.headers ?? {}]);
    const key = keys.current.get(request) ?? crypto.randomUUID();
    keys.current.set(request, key);
    try {
      const answer = await apiPost<T>(path, body, {
        ...options,
        headers: { ...options.headers, 'idempotency-key': key },
      });
      keys.current.delete(request);
      return answer;
    } catch (error) {
      if (!outcomeUnknown(error)) {
        keys.current.delete(request);
      }
      throw error;
    }
  }, []);
}
