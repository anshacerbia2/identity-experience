import { randomUUID, type webcrypto } from 'node:crypto';

import { SignJWT } from 'jose';

import type { ClientKey } from '../auth/client-key.js';

// The enrolment workload's access token (ADR-IAM-011 §5.8; TDD-identity-experience-001 1.24.0
// §Enrolment From an Invitation). The BFF calls the two enrolment routes as its own registered
// workload, with its own client and key (ADR-IAM-003 §5.8, STD-GLB-009 rule 15), never with a
// person's token: no one is signed in. It is an OAuth client credentials grant (RFC 6749 §4.4),
// authenticated by a PS256 assertion signed with the workload's key (RFC 7523, private_key_jwt), never
// a secret (ADR-IAM-001 §5.12). The token is held in this process's memory alone, never stored or
// logged, and is used until shortly before it expires.

const clientAssertionType = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const clientAssertionLifetimeSeconds = 60;

// A token is renewed this long before its stated expiry, so a call never carries one that lapses on
// the way.
const renewSkewMs = 30_000;

export class WorkloadTokenUnavailable extends Error {
  override readonly name = 'WorkloadTokenUnavailable';
}

export interface WorkloadTokenOptions {
  // tokenEndpoint is the kernel's token endpoint, on the address this process reaches it at.
  readonly tokenEndpoint: string;
  // issuer is the realm's public issuer, the audience of the assertion, as the kernel expects.
  readonly issuer: string;
  readonly clientId: string;
  readonly clientKey: ClientKey;
  readonly timeoutMs: number;
  readonly now: () => Date;
}

export class WorkloadToken {
  readonly #options: WorkloadTokenOptions;
  readonly #key: webcrypto.CryptoKey;
  #current: { readonly token: string; readonly renewAt: number } | null = null;
  #pending: Promise<string> | null = null;

  constructor(options: WorkloadTokenOptions) {
    this.#options = options;
    // RSA-PSS with SHA-256 signs PS256. The key is not extractable.
    this.#key = options.clientKey.privateKey.toCryptoKey({ name: 'RSA-PSS', hash: 'SHA-256' }, false, [
      'sign',
    ]);
  }

  // get answers the current token, or obtains one. Concurrent callers share one request.
  async get(): Promise<string> {
    const now = this.#options.now().getTime();
    if (this.#current !== null && now < this.#current.renewAt) {
      return this.#current.token;
    }
    this.#pending ??= this.#obtain().finally(() => {
      this.#pending = null;
    });
    return this.#pending;
  }

  // drop forgets the token, after identity-control refused it, so the next call presents a fresh one.
  drop(): void {
    this.#current = null;
  }

  async #obtain(): Promise<string> {
    let response: Response;
    try {
      response = await fetch(this.#options.tokenEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.#options.clientId,
          client_assertion_type: clientAssertionType,
          client_assertion: await this.#assertion(),
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.#options.timeoutMs),
      });
    } catch (error) {
      throw new WorkloadTokenUnavailable('the kernel did not answer the token request', { cause: error });
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new WorkloadTokenUnavailable(`the kernel answered the token request ${String(response.status)}`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new WorkloadTokenUnavailable('the kernel answered the token request with no JSON');
    }
    const { access_token: token, expires_in: expiresIn } = (body ?? {}) as Record<string, unknown>;
    if (typeof token !== 'string' || token === '' || typeof expiresIn !== 'number' || expiresIn <= 0) {
      throw new WorkloadTokenUnavailable('the kernel answered the token request without a token');
    }
    const renewAt = this.#options.now().getTime() + expiresIn * 1000 - renewSkewMs;
    this.#current = { token, renewAt };
    return token;
  }

  async #assertion(): Promise<string> {
    const issuedAt = Math.floor(this.#options.now().getTime() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'PS256', kid: this.#options.clientKey.kid, typ: 'JWT' })
      .setIssuer(this.#options.clientId)
      .setSubject(this.#options.clientId)
      .setAudience(this.#options.issuer)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + clientAssertionLifetimeSeconds)
      .sign(this.#key);
  }
}
