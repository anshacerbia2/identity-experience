import type { BlockList } from 'node:net';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { clientAddress, forwardedFor } from './client-address.js';
import { WorkloadTokenUnavailable, type WorkloadToken } from './workload-token.js';
import { originAllowed } from '../http/csrf.js';
import { sendProblem } from '../http/problem.js';

// The enrolment page's two anonymous routes (ADR-IAM-011 §5.1 to §5.3, §5.8;
// TDD-identity-experience-001 1.24.0 §Enrolment From an Invitation):
//
//   POST /auth/enrolment          {"token"}                 -> identity-control POST /v1/enrolments
//   POST /auth/enrolment/verify   {"enrolment_id","code"}   -> POST /v1/enrolments/{enrolment_id}:verify
//
// No one is signed in, so no session, cookie or CSRF token is read or set. The BFF calls
// identity-control as its own enrolment workload and states the client address in `Forwarded`. It
// makes no decision: identity-control's one answer per outcome is what the page shows, and nothing in
// the BFF's answer depends on whether the token names an invitation.

export interface EnrolmentRoutesOptions {
  readonly publicOrigin: string;
  readonly identityControlBaseUrl: string;
  readonly timeoutMs: number;
  // token is the enrolment workload's token source; null when this deployment serves no enrolment.
  readonly token: WorkloadToken | null;
  readonly ingress: BlockList | null;
}

// What the browser sends, and what identity-control reads (api/openapi.yaml 1.2.0).
interface EnrolmentRequest {
  readonly token: string;
}

interface VerifyEnrolmentRequest {
  readonly code: string;
}

// What identity-control answers on success, and the BFF passes on whole.
interface EnrolmentAccepted {
  readonly enrolment_id: string;
}

interface EnrolmentCompleted {
  readonly principal_id: string;
  readonly username: string;
  readonly temporary_password: string;
  readonly lapses_at: string;
}

// The bounds on what the browser sends. They depend on the body alone, never on any invitation.
const maxTokenLength = 1024;
const maxCodeLength = 64;
const bodyLimit = 4096;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// onlyKeys is whether a body has exactly these members, as identity-control's schemas require.
const onlyKeys = (body: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Object.keys(body).length === keys.length && keys.every((key) => key in body);

const isString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

const mediaType = (request: FastifyRequest): string =>
  (request.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';

// forgeryRefusal is why a request is refused before its body is read, or null. The three checks of
// TDD-identity-experience-001 1.24.0 §Forgery Defences Without a Session, each independent:
//
// 1. Origin equals this origin. OWASP: "If the Origin header is present, verify that its value
//    matches the target origin"; a request with none is refused, as on the session routes.
// 2. Sec-Fetch-Site is same-origin. OWASP: "Treat cross-site as untrusted for state-changing actions",
//    and, absent, "Fail-safe (recommended for sensitive endpoints): treat absence as unknown and block
//    the request."
// 3. The body is application/json. A cross-site form can send only "application/x-www-form-urlencoded,
//    multipart/form-data or text/plain" without a preflight, and OWASP: "a simple mitigation is for the
//    server or API to disallow these simple content types". This process answers no preflight.
function forgeryRefusal(request: FastifyRequest, publicOrigin: string): string | null {
  if (!originAllowed(request, publicOrigin)) {
    return 'An enrolment request must come from this origin';
  }
  if (request.headers['sec-fetch-site'] !== 'same-origin') {
    return 'An enrolment request must be a same-origin fetch';
  }
  if (mediaType(request) !== 'application/json') {
    return 'An enrolment request is application/json';
  }
  return null;
}

export function enrolmentRoutes(
  app: FastifyInstance,
  options: EnrolmentRoutesOptions,
  done: () => void,
): void {
  // The body is parsed here, in this plugin's scope only, and nothing but JSON is accepted. Its text
  // is never logged: it carries the invitation token or the code.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit }, (_request, body, parsed) => {
    try {
      parsed(null, JSON.parse(body as string) as unknown);
    } catch {
      parsed(null, undefined);
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    const refusal = forgeryRefusal(request, options.publicOrigin);
    if (refusal !== null) {
      request.log.warn({ reason: refusal }, 'enrolment request refused');
      return sendProblem(request, reply, 'forbidden', refusal);
    }
    return undefined;
  });

  // apiPost sends one enrolment call to identity-control as the enrolment workload, with the client
  // address the platform's edge saw. It answers null after answering the browser itself.
  const apiPost = async (
    path: string,
    body: EnrolmentRequest | VerifyEnrolmentRequest,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<Response | null> => {
    if (options.token === null) {
      request.log.warn('enrolment is not configured: IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_ID is unset');
      sendProblem(request, reply, 'dependencyUnavailable');
      return null;
    }
    const address = clientAddress(
      request.socket.remoteAddress,
      request.headers['x-forwarded-for'],
      options.ingress,
    );
    if (address === null) {
      request.log.error('the trusted ingress stated no single client address in X-Forwarded-For');
      sendProblem(request, reply, 'dependencyUnavailable');
      return null;
    }
    let bearer: string;
    try {
      bearer = await options.token.get();
    } catch (error) {
      request.log.error(
        { err: error instanceof WorkloadTokenUnavailable ? error.message : 'token request failed' },
        'the enrolment workload has no token',
      );
      sendProblem(request, reply, 'dependencyUnavailable');
      return null;
    }
    try {
      return await fetch(new URL(`${options.identityControlBaseUrl}${path}`), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearer}`,
          accept: 'application/json',
          'content-type': 'application/json',
          forwarded: forwardedFor(address),
        },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      request.log.error('identity-control unreachable for enrolment');
      sendProblem(request, reply, 'dependencyUnavailable');
      return null;
    }
  };

  // refusal answers every status but the success one. identity-control's body is never passed on:
  // the page chooses its sentence from the status alone (TDD-identity-experience-001 1.24.0 §One
  // Sentence per Answer).
  const refusal = async (
    request: FastifyRequest,
    reply: FastifyReply,
    response: Response,
  ): Promise<FastifyReply> => {
    await response.body?.cancel();
    switch (response.status) {
      case 400:
        return sendProblem(request, reply, 'validationFailed');
      case 429: {
        const retryAfter = response.headers.get('retry-after') ?? '';
        if (/^\d{1,6}$/.test(retryAfter)) {
          reply.header('retry-after', retryAfter);
        }
        return sendProblem(request, reply, 'rateLimited');
      }
      case 401:
        // The token lapsed or the kernel rotated its key: the next request presents a fresh one.
        options.token?.drop();
        request.log.error('identity-control refused the enrolment workload token');
        return sendProblem(request, reply, 'dependencyUnavailable');
      case 403:
        request.log.error('the enrolment workload is not an active enrolment caller');
        return sendProblem(request, reply, 'dependencyUnavailable');
      default:
        request.log.error(
          { status: response.status },
          'identity-control did not complete the enrolment call',
        );
        return sendProblem(request, reply, 'dependencyUnavailable');
    }
  };

  const answer = (reply: FastifyReply, status: number, body: EnrolmentAccepted | EnrolmentCompleted) =>
    reply.code(status).header('cache-control', 'no-store').send(body);

  app.post('/auth/enrolment', async (request, reply) => {
    const body = request.body;
    if (!isRecord(body) || !onlyKeys(body, ['token']) || !isString(body['token'], maxTokenLength)) {
      return sendProblem(
        request,
        reply,
        'validationFailed',
        'The body is {"token": "<the invitation token>"}',
      );
    }
    const response = await apiPost('/v1/enrolments', { token: body['token'] }, request, reply);
    if (response === null) {
      return reply;
    }
    if (response.status !== 202) {
      return refusal(request, reply, response);
    }
    const accepted = await response.json().catch(() => null);
    if (
      !isRecord(accepted) ||
      typeof accepted['enrolment_id'] !== 'string' ||
      !uuidPattern.test(accepted['enrolment_id'])
    ) {
      request.log.error('identity-control answered the enrolment request without an enrolment_id');
      return sendProblem(request, reply, 'dependencyUnavailable');
    }
    return answer(reply, 202, { enrolment_id: accepted['enrolment_id'] });
  });

  app.post('/auth/enrolment/verify', async (request, reply) => {
    const body = request.body;
    if (
      !isRecord(body) ||
      !onlyKeys(body, ['enrolment_id', 'code']) ||
      typeof body['enrolment_id'] !== 'string' ||
      !uuidPattern.test(body['enrolment_id']) ||
      !isString(body['code'], maxCodeLength)
    ) {
      return sendProblem(
        request,
        reply,
        'validationFailed',
        'The body is {"enrolment_id": "<uuid>", "code": "<code>"}',
      );
    }
    const response = await apiPost(
      `/v1/enrolments/${encodeURIComponent(body['enrolment_id'])}:verify`,
      { code: body['code'] },
      request,
      reply,
    );
    if (response === null) {
      return reply;
    }
    if (response.status !== 201) {
      return refusal(request, reply, response);
    }
    // The temporary password passes through this process's memory once, to the one response that
    // shows it, with no-store; it is never logged (STD-IAM-001 3.1.0 §3.1, the second recipient).
    const completed = await response.json().catch(() => null);
    if (
      !isRecord(completed) ||
      typeof completed['principal_id'] !== 'string' ||
      typeof completed['username'] !== 'string' ||
      typeof completed['temporary_password'] !== 'string' ||
      completed['temporary_password'] === '' ||
      typeof completed['lapses_at'] !== 'string'
    ) {
      request.log.error('identity-control answered the verification without the account');
      return sendProblem(request, reply, 'dependencyUnavailable');
    }
    return answer(reply, 201, {
      principal_id: completed['principal_id'],
      username: completed['username'],
      temporary_password: completed['temporary_password'],
      lapses_at: completed['lapses_at'],
    });
  });

  done();
}
