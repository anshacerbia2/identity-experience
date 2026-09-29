// The browser's only door to the Identity Control API: the BFF's /api proxy, same origin, with the
// session cookie (TDD-identity-experience-001). No token is ever handled here; the BFF attaches it.

// ApiError is a refusal or a failure, carrying what the problem document says and nothing it did
// not: the correlation identifier is what an operator quotes to find the request in the logs.
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly type: string | null,
    readonly title: string | null,
    readonly correlationId: string | null,
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
  readonly correlation_id?: unknown;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

async function toError(response: Response): Promise<ApiError> {
  let problem: ProblemDocument = {};
  if ((response.headers.get('content-type') ?? '').includes('json')) {
    try {
      problem = (await response.json()) as ProblemDocument;
    } catch {
      problem = {};
    }
  }
  return new ApiError(response.status, text(problem.type), text(problem.title), text(problem.correlation_id));
}

// apiGet reads a path under /api/v1. The type is the API's contract; the BFF forwards the body as
// the API wrote it.
export async function apiGet<T>(path: `/v1/${string}`, signal?: AbortSignal): Promise<T> {
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
