import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import * as client from 'openid-client';

import type { OidcConfig } from '../config.js';
import type { TokenSet } from '../session/store.js';

// The scopes a sign-in asks for. `scnehaux-provider` is the identity kernel's privileged
// provider-scope profile (STD-IAM-002 §3.1): principal_id, provider_scope, acr and auth_time, and
// never tenant_id. It is what the Identity Control API accepts.
export const signInScope = 'openid scnehaux-provider';

// The one signing algorithm accepted, for ID tokens and logout tokens alike (STD-IAM-002: PS256
// is required, and nothing else is accepted without a registered exception).
const signingAlgorithm = 'PS256';

const backChannelLogoutEvent = 'http://schemas.openid.net/event/backchannel-logout';

// Identity is what a session displays and correlates on, read from a validated ID token.
export interface Identity {
  readonly subject: string;
  readonly principalId: string | null;
  readonly displayName: string | null;
  readonly keycloakSessionId: string | null;
  readonly acr: string | null;
  readonly authTime: Date | null;
}

export interface Grant {
  readonly tokens: TokenSet;
  readonly accessExpiresAt: Date;
  // identity is null only on a refresh that returned no ID token.
  readonly identity: Identity | null;
}

export interface LogoutTarget {
  readonly subject: string | null;
  readonly keycloakSessionId: string | null;
}

// OidcError is a refusal: a response, token or claim that failed validation.
export class OidcError extends Error {
  override readonly name = 'OidcError';
}

// IdentityProviderUnavailable is an outage: the identity kernel did not answer.
export class IdentityProviderUnavailable extends Error {
  override readonly name = 'IdentityProviderUnavailable';
}

const trimSlash = (url: string): string => url.replace(/\/+$/, '');

const stringClaim = (claims: JWTPayload | client.IDToken | undefined, name: string): string | null => {
  const value = claims?.[name];
  return typeof value === 'string' && value !== '' ? value : null;
};

// Oidc is the BFF's side of the authorization code flow with the identity kernel, as a
// confidential client.
//
// The server metadata is written out rather than discovered. Keycloak states one issuer whatever
// address it is reached on, so a process that reaches it on an internal address would discover a
// document whose issuer is the public one, and openid-client refuses that mismatch. The browser is
// sent to the public endpoints; the token and key endpoints are called on the internal address;
// every token is still validated against the public issuer. The paths are Keycloak's.
export class Oidc {
  readonly #configuration: client.Configuration;
  readonly #issuer: string;
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #redirectUri: string;
  readonly #logoutEndpoint: string;
  readonly #keys: ReturnType<typeof createRemoteJWKSet>;
  readonly #now: () => Date;

  constructor(config: OidcConfig, now: () => Date) {
    const publicRealm = trimSlash(config.issuer);
    const internalRealm = trimSlash(config.internalBaseUrl);
    const metadata: client.ServerMetadata = {
      issuer: config.issuer,
      authorization_endpoint: `${publicRealm}/protocol/openid-connect/auth`,
      token_endpoint: `${internalRealm}/protocol/openid-connect/token`,
      jwks_uri: `${internalRealm}/protocol/openid-connect/certs`,
      code_challenge_methods_supported: ['S256'],
      id_token_signing_alg_values_supported: [signingAlgorithm],
      // Keycloak returns `iss` on the authorization response (RFC 9207); declaring it makes the
      // callback refuse a response that does not carry this issuer.
      authorization_response_iss_parameter_supported: true,
    };
    this.#configuration = new client.Configuration(
      metadata,
      config.clientId,
      { id_token_signed_response_alg: signingAlgorithm },
      client.ClientSecretBasic(config.clientSecret),
    );
    // The token endpoint is reached directly, which lets openid-client trust TLS for the issuer and
    // skip the signature. The internal address may not be TLS, and TDD-identity-experience-001
    // validates the signature regardless, so the check is turned on.
    client.enableNonRepudiationChecks(this.#configuration);
    // Plain HTTP only where configuration allowed it: the internal address inside a private network,
    // or a developer's own machine (config.ts refuses a plain-HTTP issuer anywhere else).
    if (new URL(internalRealm).protocol === 'http:' || new URL(publicRealm).protocol === 'http:') {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- flagged by openid-client to stand out, not scheduled for removal; bounded as above.
      client.allowInsecureRequests(this.#configuration);
    }
    this.#issuer = config.issuer;
    this.#clientId = config.clientId;
    this.#clientSecret = config.clientSecret;
    this.#redirectUri = config.redirectUri;
    this.#logoutEndpoint = `${internalRealm}/protocol/openid-connect/logout`;
    this.#keys = createRemoteJWKSet(new URL(`${internalRealm}/protocol/openid-connect/certs`));
    this.#now = now;
  }

  authorizationUrl(checks: { state: string; nonce: string; codeChallenge: string }): URL {
    return client.buildAuthorizationUrl(this.#configuration, {
      redirect_uri: this.#redirectUri,
      scope: signInScope,
      response_type: 'code',
      state: checks.state,
      nonce: checks.nonce,
      code_challenge: checks.codeChallenge,
      code_challenge_method: 'S256',
    });
  }

  // exchange redeems the code on the callback. The callback URL is rebuilt on the registered
  // redirect URI from the query alone, never from the request's Host header, so the redirect_uri
  // sent to the token endpoint is the registered one.
  async exchange(
    query: string,
    checks: { state: string; nonce: string; codeVerifier: string },
  ): Promise<Grant> {
    const callback = new URL(this.#redirectUri);
    callback.search = query;
    try {
      const response = await client.authorizationCodeGrant(this.#configuration, callback, {
        pkceCodeVerifier: checks.codeVerifier,
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        idTokenExpected: true,
      });
      return this.#grant(response, null);
    } catch (error) {
      throw new OidcError('the authorization response or the token exchange was refused', { cause: error });
    }
  }

  async refresh(current: TokenSet): Promise<Grant> {
    if (current.refreshToken === null) {
      throw new OidcError('the session holds no refresh token');
    }
    let response: Awaited<ReturnType<typeof client.refreshTokenGrant>>;
    try {
      response = await client.refreshTokenGrant(this.#configuration, current.refreshToken);
    } catch (error) {
      // An OAuth error response (invalid_grant: the Keycloak session is gone) is a refusal, and
      // ends the session. A network failure or a 5xx is an outage: the session outlives it.
      if (error instanceof client.ResponseBodyError && error.status < 500) {
        throw new OidcError('the refresh was refused', { cause: error });
      }
      throw new IdentityProviderUnavailable('the identity kernel could not be reached for a refresh', {
        cause: error,
      });
    }
    try {
      return this.#grant(response, current);
    } catch (error) {
      throw new OidcError('the refreshed tokens were refused', { cause: error });
    }
  }

  // endKeycloakSession ends the identity kernel's session server to server, with the refresh token
  // and the client's own authentication. RP-initiated logout through the browser would put the ID
  // token in a URL the browser holds (`id_token_hint`), which TDD-identity-experience-001 forbids;
  // this is Keycloak's endpoint for a confidential client to do it directly.
  //
  // It resolves to false when the kernel did not confirm. The BFF session is ended regardless; a
  // Keycloak session left behind is ended by its own expiry, and is logged.
  async endKeycloakSession(tokens: TokenSet): Promise<boolean> {
    if (tokens.refreshToken === null) {
      return false;
    }
    const credentials = Buffer.from(
      `${encodeURIComponent(this.#clientId)}:${encodeURIComponent(this.#clientSecret)}`,
    ).toString('base64');
    try {
      const response = await fetch(this.#logoutEndpoint, {
        method: 'POST',
        headers: {
          authorization: `Basic ${credentials}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ client_id: this.#clientId, refresh_token: tokens.refreshToken }),
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
      return response.status === 204 || response.status === 200;
    } catch {
      return false;
    }
  }

  // verifyLogoutToken validates a back-channel logout token per OpenID Connect Back-Channel Logout
  // 1.0 §2.6: signature, issuer, audience, a recent iat, the logout event, no nonce, and a sid or
  // a sub to act on.
  async verifyLogoutToken(token: string): Promise<LogoutTarget> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.#keys, {
        issuer: this.#issuer,
        audience: this.#clientId,
        algorithms: [signingAlgorithm],
        requiredClaims: ['iat', 'jti'],
        maxTokenAge: '2m',
      }));
    } catch (error) {
      throw new OidcError('the logout token was refused', { cause: error });
    }
    const events = payload['events'];
    if (typeof events !== 'object' || events === null || !(backChannelLogoutEvent in events)) {
      throw new OidcError('the logout token carries no back-channel logout event');
    }
    if ('nonce' in payload) {
      throw new OidcError('a logout token must not carry a nonce');
    }
    const target = { subject: stringClaim(payload, 'sub'), keycloakSessionId: stringClaim(payload, 'sid') };
    if (target.subject === null && target.keycloakSessionId === null) {
      throw new OidcError('the logout token names neither a session nor a subject');
    }
    return target;
  }

  // #grant reads a token response. The ID token is validated and read here, and not kept: nothing
  // after sign-in needs it, and a session holds no credential it does not use. A refresh response
  // may carry none; identity is then null, because nothing it asserted has changed.
  #grant(
    response: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    previous: TokenSet | null,
  ): Grant {
    const claims = response.claims();
    if (claims === undefined && previous === null) {
      throw new OidcError('the token response carries no ID token');
    }
    const authTime = claims?.auth_time;
    return {
      tokens: {
        accessToken: response.access_token,
        // Keycloak may rotate the refresh token or return none on a refresh; the previous one
        // stays in use until it does.
        refreshToken: response.refresh_token ?? previous?.refreshToken ?? null,
      },
      accessExpiresAt: new Date(this.#now().getTime() + (response.expiresIn() ?? 0) * 1_000),
      identity:
        claims === undefined
          ? null
          : {
              subject: claims.sub,
              principalId: stringClaim(claims, 'principal_id'),
              displayName:
                stringClaim(claims, 'name') ??
                stringClaim(claims, 'preferred_username') ??
                stringClaim(claims, 'email'),
              keycloakSessionId: stringClaim(claims, 'sid'),
              acr: stringClaim(claims, 'acr'),
              authTime: typeof authTime === 'number' ? new Date(authTime * 1_000) : null,
            },
    };
  }
}
