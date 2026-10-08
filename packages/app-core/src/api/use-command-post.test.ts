import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCommandPost } from './use-command-post';

// STD-GLB-001 1.4.0: every command carries an Idempotency-Key, one per distinct request, reused on a
// retry of the same request while its outcome is unknown.

type Answer = { status: number; body?: unknown };

function stub(answers: Answer[]): { keys: (string | null)[] } {
  const keys: (string | null)[] = [];
  vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get('idempotency-key'));
    const answer = answers.shift() ?? { status: 200, body: {} };
    if (answer.status === 0) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve(
      new Response(JSON.stringify(answer.body ?? {}), {
        status: answer.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  return { keys };
}

const options = { csrfToken: 'csrf', headers: { 'x-administrative-reason': 'A reason long enough' } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCommandPost', () => {
  it('sends a key, and reuses it for the same request after no answer, a 5xx or one still in progress', async () => {
    const { keys } = stub([
      { status: 0 },
      { status: 503 },
      { status: 409, body: { type: 'https://problems.scnehaux.com/request-in-progress' } },
      { status: 200 },
    ]);
    const { result } = renderHook(() => useCommandPost());
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(result.current('/v1/workloads:sweep', {}, options)).rejects.toThrow();
    }
    await result.current('/v1/workloads:sweep', {}, options);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(keys).size).toBe(1);
  });

  it('takes a new key once the outcome is known, success or refusal', async () => {
    const { keys } = stub([{ status: 201 }, { status: 409, body: { type: 'x' } }, { status: 201 }]);
    const { result } = renderHook(() => useCommandPost());
    await result.current('/v1/registrations/r/owners', { principal_id: 'p' }, options);
    await expect(
      result.current('/v1/registrations/r/owners', { principal_id: 'p' }, options),
    ).rejects.toThrow();
    await result.current('/v1/registrations/r/owners', { principal_id: 'p' }, options);
    expect(new Set(keys).size).toBe(3);
  });

  it('never reuses a key for a different request', async () => {
    const { keys } = stub([{ status: 503 }, { status: 503 }, { status: 503 }]);
    const { result } = renderHook(() => useCommandPost());
    await expect(result.current('/v1/a', { x: 1 }, options)).rejects.toThrow();
    await expect(result.current('/v1/a', { x: 2 }, options)).rejects.toThrow();
    await expect(
      result.current(
        '/v1/a',
        { x: 1 },
        { ...options, headers: { 'x-administrative-reason': 'Another reason' } },
      ),
    ).rejects.toThrow();
    expect(new Set(keys).size).toBe(3);
  });

  it('sends the key a caller already holds, unchanged', async () => {
    const { keys } = stub([{ status: 201 }]);
    const { result } = renderHook(() => useCommandPost());
    await result.current(
      '/v1/principals',
      {},
      { csrfToken: 'csrf', headers: { 'idempotency-key': 'held-key' } },
    );
    expect(keys).toEqual(['held-key']);
  });
});
