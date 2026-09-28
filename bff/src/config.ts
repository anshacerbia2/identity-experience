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
}

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`configuration: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

const logLevels = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace']);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  const required = (name: string): string => {
    const value = env[name]?.trim() ?? '';
    if (value === '') {
      problems.push(`${name} is required`);
    }
    return value;
  };

  const publicOrigin = required('IDENTITY_EXPERIENCE_PUBLIC_ORIGIN');
  if (publicOrigin !== '') {
    try {
      const parsed = new URL(publicOrigin);
      if (parsed.origin !== publicOrigin) {
        problems.push(
          `IDENTITY_EXPERIENCE_PUBLIC_ORIGIN must be an exact origin such as https://id.example.com, got ${publicOrigin}`,
        );
      }
    } catch {
      problems.push('IDENTITY_EXPERIENCE_PUBLIC_ORIGIN is not a URL');
    }
  }

  const webRoot = required('IDENTITY_EXPERIENCE_WEB_ROOT');

  const rawPort = env['IDENTITY_EXPERIENCE_LISTEN_PORT']?.trim() || '8080';
  const listenPort = Number.parseInt(rawPort, 10);
  if (
    !Number.isInteger(listenPort) ||
    listenPort <= 0 ||
    listenPort > 65535 ||
    String(listenPort) !== rawPort
  ) {
    problems.push(`IDENTITY_EXPERIENCE_LISTEN_PORT: ${rawPort} is not a port`);
  }

  const logLevel = env['LOG_LEVEL']?.trim() || 'info';
  if (!logLevels.has(logLevel)) {
    problems.push(`LOG_LEVEL: ${logLevel} is not one of ${[...logLevels].join(', ')}`);
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }
  return {
    listenHost: env['IDENTITY_EXPERIENCE_LISTEN_HOST']?.trim() || '0.0.0.0',
    listenPort,
    webRoot,
    publicOrigin,
    logLevel: logLevel as Config['logLevel'],
  };
}
