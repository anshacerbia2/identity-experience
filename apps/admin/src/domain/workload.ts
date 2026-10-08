// Workloads as the Identity Control API exposes them (TDD-identity-control-004): a service, job or
// connector that authenticates as its own client with its own key, and the human accountable for it.
//
// A workload is created here and not as a Principal: its Keycloak user is its client's
// service-account user, the one a client credentials token is issued for, so identity-control
// creates the client and writes the workload's identity there. This console never holds the
// workload's private key. The workload's team generates the key pair and pastes the public half.

import type { PublicJwk } from '@identity-experience/app-core/domain/public-key';
import {
  mayReview,
  type Workload,
  type WorkloadState,
  type WorkloadType,
} from '@identity-experience/app-core/domain/workload';

export {
  readPublicKey,
  type PublicJwk,
  type PublicKeyProblem,
} from '@identity-experience/app-core/domain/public-key';

// The record and who may review it are shared with the Developer Console, where a workload's owner
// reviews it (TDD-identity-experience-004 §Ownership).
export type { Workload, WorkloadState, WorkloadType } from '@identity-experience/app-core/domain/workload';

// An agent is representable upstream and refused until bounded delegation is built, so it is not
// offered here.
export const workloadTypes: readonly WorkloadType[] = ['service', 'job', 'connector'];

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

export interface ReassignRequest {
  readonly owner_principal_id: string;
}

// The workload lifecycle (TDD-identity-control-004 §Suspension, Restoration, and Retirement): a
// workload is suspended, then restored or retired. A retirement comes only after a suspension.
export type WorkloadAction = 'suspend' | 'restore' | 'retire';

// workloadActions are the actions the API accepts for the workload as it stands, and so the only ones
// the console offers.
export function workloadActions(workload: Pick<Workload, 'state'>): readonly WorkloadAction[] {
  switch (workload.state) {
    case 'active':
    case 'orphaned':
      return ['suspend'];
    case 'suspended':
      return ['restore', 'retire'];
    default:
      return [];
  }
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

// Upkeep is what keeps a workload accountable beside its lifecycle (TDD-identity-control-004 1.5.0):
// rebuilding a client deleted in the kernel, and the owner's periodic review.
export type WorkloadUpkeep = 'rebuild' | 'review';

// workloadUpkeep is what the API accepts from this operator for the workload as it stands. A rebuild
// is a provider's for an active or orphaned workload; the API refuses it while the client exists,
// which the record cannot tell. A review is the owner's alone, of an active workload.
export function workloadUpkeep(
  workload: Pick<Workload, 'state' | 'owner_principal_id'>,
  operator: string | null,
): readonly WorkloadUpkeep[] {
  const upkeep: WorkloadUpkeep[] = [];
  if (workload.state === 'active' || workload.state === 'orphaned') {
    upkeep.push('rebuild');
  }
  if (mayReview(workload, operator)) {
    upkeep.push('review');
  }
  return upkeep;
}

// The sweep's three listings (TDD-identity-control-004 1.5.0).
export type WorkloadCondition = 'orphaned' | 'unused' | 'reviews-overdue';

export const workloadConditions: readonly WorkloadCondition[] = ['orphaned', 'unused', 'reviews-overdue'];

// A workload in one of the conditions. since is when the condition began: orphaned at, last seen (or
// activated), or the review's due date.
export interface ConditionRow {
  readonly principal_id: string;
  readonly client_key: string;
  readonly display_name: string;
  readonly owner_principal_id: string;
  readonly state: WorkloadState;
  readonly since: string;
  readonly stage?: 'reminder' | 'escalated' | 'suspended';
  readonly last_seen_at?: string;
}

// What one workload sweep did.
export interface WorkloadSweep {
  readonly orphaned: number;
  readonly reclaimed: number;
  readonly suspended: number;
  readonly unused: number;
  readonly reviews_overdue: number;
}
