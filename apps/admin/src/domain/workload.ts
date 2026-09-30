// Workloads as the Identity Control API exposes them (TDD-identity-control-004): a service, job or
// connector that authenticates as its own client with its own key, and the human accountable for it.
//
// A workload is created here and not as a Principal: its Keycloak user is its client's
// service-account user, the one a client credentials token is issued for, so identity-control
// creates the client and writes the workload's identity there. This console never holds the
// workload's private key. The workload's team generates the key pair and pastes the public half.

export type WorkloadType = 'service' | 'job' | 'connector';

// An agent is representable upstream and refused until bounded delegation is built, so it is not
// offered here.
export const workloadTypes: readonly WorkloadType[] = ['service', 'job', 'connector'];

export type WorkloadState = 'pending' | 'active' | 'orphaned' | 'suspended' | 'retired';

export interface PublicJwk {
  readonly kty: string;
  readonly n: string;
  readonly e: string;
  readonly kid?: string;
  readonly use?: string;
  readonly alg?: string;
}

export interface CreateWorkloadRequest {
  readonly display_name: string;
  readonly purpose: string;
  readonly workload_type: WorkloadType;
  readonly owner_principal_id: string;
  readonly team_reference?: string;
  readonly client_key: string;
  readonly application_ref: string;
  readonly audience?: readonly string[];
  readonly public_key: PublicJwk;
}

export interface Workload {
  readonly principal_id: string;
  readonly registration_id: string;
  readonly client_key: string;
  readonly display_name: string;
  readonly purpose: string;
  readonly workload_type: WorkloadType;
  readonly owner_principal_id: string;
  readonly team_reference?: string;
  readonly owner_recorded_at: string;
  readonly state: WorkloadState;
  readonly orphaned_at: string | null;
  readonly last_seen_at: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly activated_at: string | null;
}

export interface ReassignRequest {
  readonly owner_principal_id: string;
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

const clientKey = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export const isClientKey = (value: string): boolean => clientKey.test(value.trim());

// audienceList reads a comma- or space-separated list of resource client_keys.
export function audienceList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

// createWorkloadRequest shapes what the form holds into what the API accepts. An empty team or
// audience is left out rather than sent empty.
export function createWorkloadRequest(values: {
  readonly displayName: string;
  readonly purpose: string;
  readonly workloadType: WorkloadType;
  readonly owner: string;
  readonly teamReference: string;
  readonly clientKey: string;
  readonly applicationRef: string;
  readonly audience: string;
  readonly publicKey: PublicJwk;
}): CreateWorkloadRequest {
  const audience = audienceList(values.audience);
  const team = values.teamReference.trim();
  return {
    display_name: values.displayName.trim(),
    purpose: values.purpose.trim(),
    workload_type: values.workloadType,
    owner_principal_id: values.owner.trim(),
    ...(team === '' ? {} : { team_reference: team }),
    client_key: values.clientKey.trim(),
    application_ref: values.applicationRef.trim(),
    ...(audience.length === 0 ? {} : { audience }),
    public_key: values.publicKey,
  };
}
