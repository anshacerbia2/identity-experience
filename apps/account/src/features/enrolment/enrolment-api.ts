import {
  normalizedCode,
  requestOutcome,
  verifyOutcome,
  type EnrolledAccount,
  type RequestOutcome,
  type VerifyOutcome,
} from '@/domain/enrolment';

// The enrolment page's two calls, to the BFF's anonymous routes (TDD-identity-experience-001 1.24.0
// §Enrolment From an Invitation). No one is signed in, so they carry no CSRF token and no
// Idempotency-Key. The browser adds Origin and Sec-Fetch-Site itself, and the body is JSON, which is
// what the BFF's forgery checks read. Nothing is cached: the answers are no-store, and the request
// asks for no cache either. No referrer is sent.

const init = (body: unknown): RequestInit => ({
  method: 'POST',
  credentials: 'same-origin',
  cache: 'no-store',
  referrerPolicy: 'no-referrer',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify(body),
});

async function send(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, init(body));
  } catch {
    return null;
  }
}

async function jsonOf(response: Response): Promise<Readonly<Record<string, unknown>> | null> {
  try {
    const body = (await response.json()) as unknown;
    return typeof body === 'object' && body !== null ? (body as Readonly<Record<string, unknown>>) : null;
  } catch {
    return null;
  }
}

// requestCode asks for a code to be sent to the invited address.
export async function requestCode(token: string): Promise<RequestOutcome> {
  const response = await send('/auth/enrolment', { token });
  if (response === null) {
    return { kind: 'unavailable' };
  }
  const body = response.status === 202 ? await jsonOf(response) : null;
  const enrolmentId = typeof body?.['enrolment_id'] === 'string' ? body['enrolment_id'] : null;
  return requestOutcome(response.status, response.headers.get('retry-after'), enrolmentId);
}

// verifyCode returns the code; the right one answers the account and its temporary password, once.
export async function verifyCode(enrolmentId: string, typed: string): Promise<VerifyOutcome> {
  const response = await send('/auth/enrolment/verify', {
    enrolment_id: enrolmentId,
    code: normalizedCode(typed),
  });
  if (response === null) {
    return { kind: 'unavailable' };
  }
  let account: EnrolledAccount | null = null;
  if (response.status === 201) {
    const body = await jsonOf(response);
    if (
      typeof body?.['username'] === 'string' &&
      typeof body['temporary_password'] === 'string' &&
      typeof body['lapses_at'] === 'string'
    ) {
      account = {
        username: body['username'],
        temporaryPassword: body['temporary_password'],
        lapsesAt: body['lapses_at'],
      };
    }
  }
  return verifyOutcome(response.status, response.headers.get('retry-after'), account);
}
