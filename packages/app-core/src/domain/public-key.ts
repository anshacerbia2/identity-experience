// A client's public key, as the team pastes it (ADR-IAM-001 §5.12). The team generates the key pair
// where the private key will live and pastes the public half; this console never generates, accepts
// or holds a private key. Used for a workload's first key and for a registration's next key.

export interface PublicJwk {
  readonly kty: string;
  readonly n: string;
  readonly e: string;
  readonly kid?: string;
  readonly use?: string;
  readonly alg?: string;
}

// The members that carry private material: RSA's private exponent and CRT values, the other-primes
// list, and a symmetric key's value. identity-control and its database refuse the same list.
const privateMembers = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'] as const;

const publicMembers = new Set(['kty', 'kid', 'use', 'alg', 'n', 'e']);

const base64url = /^[A-Za-z0-9_-]+$/;

export type PublicKeyProblem = 'empty' | 'notJson' | 'private' | 'notRsa' | 'members' | 'algorithm';

// readPublicKey checks a pasted JWK before it is sent. A private key is refused here, so it never
// leaves the browser. It does not replace identity-control's validation: the size of the modulus,
// the exponent and the thumbprint are checked there.
export function readPublicKey(
  text: string,
): { readonly key: PublicJwk } | { readonly problem: PublicKeyProblem } {
  if (text.trim() === '') {
    return { problem: 'empty' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { problem: 'notJson' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { problem: 'notJson' };
  }
  const members = parsed as Record<string, unknown>;
  if (privateMembers.some((member) => member in members)) {
    return { problem: 'private' };
  }
  if (members['kty'] !== 'RSA') {
    return { problem: 'notRsa' };
  }
  const names = Object.keys(members);
  if (
    names.some((name) => !publicMembers.has(name)) ||
    names.some((name) => typeof members[name] !== 'string') ||
    typeof members['n'] !== 'string' ||
    !base64url.test(members['n']) ||
    typeof members['e'] !== 'string' ||
    !base64url.test(members['e'])
  ) {
    return { problem: 'members' };
  }
  if ((members['alg'] ?? 'PS256') !== 'PS256' || (members['use'] ?? 'sig') !== 'sig') {
    return { problem: 'algorithm' };
  }
  return { key: members as unknown as PublicJwk };
}
