import { csrfHeader } from '../session/session';

// The browser's only door to the Identity Control API: the BFF's /api proxy, same origin, with the
// session cookie (TDD-identity-experience-001). No token is ever handled here; the BFF attaches it.

// ApiError is a refusal or a failure, carrying what the problem document says. The correlation
// identifier is what an operator quotes to find the request in the logs. `detail` is the API's
// own sentence about a refusal; the Identity Control API writes it to name a rule, never a stored
// value, and it is shown attributed to the API, never as the application's words.
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly type: string | null,
    readonly title: string | null,
    readonly detail: string | null,
    readonly correlationId: string | null,
    // stepUp is set when the API asked for a stronger or fresher sign-in: RFC 9470's
    // insufficient_user_authentication, with the level it names and the age it allows. The session
    // is still valid; the application offers that sign-in (TDD-identity-experience-001 §Step-Up).
    readonly stepUp: StepUp | null = null,
  ) {
    super(`${String(status)}${title === null ? '' : ` ${title}`}`);
  }

  // A 4xx is the request's fault, or the session's: retrying it returns the same answer.
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

interface ProblemDocument {
  readonly type?: unknown;
  readonly title?: unknown;
  readonly detail?: unknown;
  readonly correlation_id?: unknown;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

// StepUp is what a step-up challenge asks for: a level (acr_values), an age (max_age), or both.
export interface StepUp {
  readonly acr: string | null;
  readonly maxAge: number | null;
}

// stepUpChallenge reads a step-up challenge from WWW-Authenticate, or null when the 401 is not one.
export function stepUpChallenge(header: string | null): StepUp | null {
  if (header === null || !/error="insufficient_user_authentication"/.test(header)) {
    return null;
  }
  const maxAge = /max_age="?(\d{1,5})"?/.exec(header);
  // acr_values lists levels in order of preference; the first is the one asked for.
  const acr = /acr_values="([^"\s]+)/.exec(header);
  return {
    acr: acr?.[1] ?? null,
    maxAge: maxAge?.[1] === undefined ? null : Number(maxAge[1]),
  };
}

async function toError(response: Response): Promise<ApiError> {
  let problem: ProblemDocument = {};
  if ((response.headers.get('content-type') ?? '').includes('json')) {
    try {
      problem = (await response.json()) as ProblemDocument;
    } catch {
      problem = {};
    }
  }
  return new ApiError(
    response.status,
    text(problem.type),
    text(problem.title),
    text(problem.detail),
    text(problem.correlation_id),
    response.status === 401 ? stepUpChallenge(response.headers.get('www-authenticate')) : null,
  );
}

type ApiPath = `/v1/${string}`;

// apiGet reads a path under /api/v1. The type is the API's contract; the BFF forwards the body as
// the API wrote it.
export async function apiGet<T>(path: ApiPath, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw await toError(response);
  }
  return (await response.json()) as T;
}

export interface PostOptions {
  // csrfToken is the session's, from /auth/session. The BFF refuses a state-changing request
  // without it (TDD-identity-experience-001 §Cross-Site Request Forgery Defence).
  readonly csrfToken: string;
  // headers are the few the proxy forwards: Idempotency-Key, X-Administrative-Reason.
  readonly headers?: Readonly<Record<string, string>>;
}

// apiPost sends a command. It is never retried here: a command that may have been applied is not
// repeated behind the operator's back (STD-GLB-FE-010 §3.4).
export async function apiPost<T>(path: ApiPath, body: unknown, options: PostOptions): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      [csrfHeader]: options.csrfToken,
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await toError(response);
  }
  return (await response.json()) as T;
}
