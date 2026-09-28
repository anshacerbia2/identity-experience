// Process configuration, read from the environment and nowhere else (STD-GLB-009). Every
// problem is reported at once: an operator fixing a deployment wants the whole list, not one
// variable per restart.

export interface Config {
  readonly listenHost: string;
  readonly listenPort: number;

  // webRoot is the built browser application this process serves. The BFF and the application
  // share one origin, so the session cookie, the content security policy and the API proxy all
  // apply to the same pages (TDD-identity-experience-001 §Runtime).
  readonly webRoot: string;

  // publicOrigin is the exact origin the browser uses. It is what the Origin check compares a
  // state-changing request against, so a value with a trailing slash would refuse every one.
  readonly publicOrigin: string;

  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

  readonly oidc: OidcConfig;
  readonly session: SessionConfig;

  // identityControlBaseUrl is the Identity Control API the proxy forwards to.
  readonly identityControlBaseUrl: string;
  readonly upstreamTimeoutMs: number;

  readonly databaseUrl: string;
}

export interface OidcConfig {
  // issuer is the expected `iss`, exactly as Keycloak's discovery document states it. Every ID
  // token and logout token is validated against it.
  readonly issuer: string;

  // internalBaseUrl is where this process reaches the same realm server to server, when that is
  // not the public issuer: the token and key endpoints are called there, and only the browser is
  // sent to the public one. Keycloak fixes `iss` to its public hostname whatever address it is
  // reached on, so the issuer is still validated as the public one.
  readonly internalBaseUrl: string;

  readonly clientId: string;
  readonly clientSecret: string;

  // redirectUri is the callback registered for this client, exactly, with no wildcard.
  readonly redirectUri: string;
}

export interface SessionConfig {
  readonly idleMs: number;
  readonly absoluteMs: number;
  readonly refreshSkewMs: number;

  // key seals the tokens a session row holds (AES-256-GCM), so a copy of the session table is not
  // a copy of anyone's tokens. 32 bytes, base64.
  readonly key: Buffer;
}

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`configuration: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

const logLevels = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace']);

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

const durationPattern = /^(\d+)(ms|s|m|h)$/;
const durationUnits: Readonly<Record<string, number>> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  const optional = (name: string): string => env[name]?.trim() ?? '';
  const required = (name: string): string => {
    const value = optional(name);
    if (value === '') {
      problems.push(`${name} is required`);
    }
    return value;
  };

  const origin = (name: string, value: string): void => {
    if (value === '') {
      return;
    }
    try {
      if (new URL(value).origin !== value) {
        problems.push(`${name} must be an exact origin such as https://id.example.com, got ${value}`);
      }
    } catch {
      problems.push(`${name} is not a URL`);
    }
  };

  const url = (name: string, value: string): void => {
    if (value === '') {
      return;
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        problems.push(`${name} must be http or https`);
      }
    } catch {
      problems.push(`${name} is not a URL`);
    }
  };

  const duration = (name: string, fallback: string): number => {
    const raw = optional(name) || fallback;
    const match = durationPattern.exec(raw);
    const unit = match?.[2];
    if (match === null || unit === undefined || Number(match[1]) <= 0) {
      problems.push(`${name}: ${raw} is not a positive duration such as 30m`);
      return 0;
    }
    return Number(match[1]) * (durationUnits[unit] ?? 0);
  };

  const publicOrigin = required('IDENTITY_EXPERIENCE_PUBLIC_ORIGIN');
  origin('IDENTITY_EXPERIENCE_PUBLIC_ORIGIN', publicOrigin);

  const webRoot = required('IDENTITY_EXPERIENCE_WEB_ROOT');

  const rawPort = optional('IDENTITY_EXPERIENCE_LISTEN_PORT') || '8080';
  const listenPort = Number.parseInt(rawPort, 10);
  if (
    !Number.isInteger(listenPort) ||
    listenPort <= 0 ||
    listenPort > 65535 ||
    String(listenPort) !== rawPort
  ) {
    problems.push(`IDENTITY_EXPERIENCE_LISTEN_PORT: ${rawPort} is not a port`);
  }

  const logLevel = optional('LOG_LEVEL') || 'info';
  if (!logLevels.has(logLevel)) {
    problems.push(`LOG_LEVEL: ${logLevel} is not one of ${[...logLevels].join(', ')}`);
  }

  const issuer = required('IDENTITY_EXPERIENCE_ISSUER');
  url('IDENTITY_EXPERIENCE_ISSUER', issuer);
  const internalBaseUrl = optional('IDENTITY_EXPERIENCE_KEYCLOAK_INTERNAL_URL') || issuer;
  url('IDENTITY_EXPERIENCE_KEYCLOAK_INTERNAL_URL', internalBaseUrl);
  const clientId = required('IDENTITY_EXPERIENCE_CLIENT_ID');
  const clientSecret = required('IDENTITY_EXPERIENCE_CLIENT_SECRET');
  const redirectUri = required('IDENTITY_EXPERIENCE_REDIRECT_URI');
  url('IDENTITY_EXPERIENCE_REDIRECT_URI', redirectUri);
  // The callback is this process's /auth/callback on the public origin, where the session cookie
  // is set. Any other value is a misconfiguration that would fail at the first sign-in.
  if (redirectUri !== '' && publicOrigin !== '' && redirectUri !== `${publicOrigin}/auth/callback`) {
    problems.push(`IDENTITY_EXPERIENCE_REDIRECT_URI must be ${publicOrigin}/auth/callback`);
  }
  // The browser is sent to the issuer, so it is TLS everywhere but a developer's own machine. The
  // internal address may be plain HTTP inside a private network: the ID token's signature is
  // verified regardless (see auth/oidc.ts).
  if (issuer !== '' && URL.canParse(issuer)) {
    const parsed = new URL(issuer);
    if (parsed.protocol !== 'https:' && !loopbackHosts.has(parsed.hostname)) {
      problems.push('IDENTITY_EXPERIENCE_ISSUER must be https unless it is on this machine');
    }
  }

  const idleMs = duration('IDENTITY_EXPERIENCE_SESSION_IDLE', '30m');
  const absoluteMs = duration('IDENTITY_EXPERIENCE_SESSION_ABSOLUTE', '8h');
  const refreshSkewMs = duration('IDENTITY_EXPERIENCE_REFRESH_SKEW', '30s');
  if (idleMs > 0 && absoluteMs > 0 && idleMs > absoluteMs) {
    problems.push('IDENTITY_EXPERIENCE_SESSION_IDLE must not exceed IDENTITY_EXPERIENCE_SESSION_ABSOLUTE');
  }

  const rawKey = required('IDENTITY_EXPERIENCE_SESSION_KEY');
  const key = Buffer.from(rawKey, 'base64');
  if (rawKey !== '' && key.length !== 32) {
    problems.push('IDENTITY_EXPERIENCE_SESSION_KEY must be 32 bytes, base64-encoded');
  }

  const identityControlBaseUrl = required('IDENTITY_CONTROL_BASE_URL');
  url('IDENTITY_CONTROL_BASE_URL', identityControlBaseUrl);
  const upstreamTimeoutMs = duration('IDENTITY_EXPERIENCE_UPSTREAM_TIMEOUT', '10s');

  const databaseUrl = required('IDENTITY_EXPERIENCE_DATABASE_URL');

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }
  return {
    listenHost: optional('IDENTITY_EXPERIENCE_LISTEN_HOST') || '0.0.0.0',
    listenPort,
    webRoot,
    publicOrigin,
    logLevel: logLevel as Config['logLevel'],
    oidc: { issuer, internalBaseUrl, clientId, clientSecret, redirectUri },
    session: { idleMs, absoluteMs, refreshSkewMs, key },
    identityControlBaseUrl: identityControlBaseUrl.replace(/\/+$/, ''),
    upstreamTimeoutMs,
    databaseUrl,
  };
}
