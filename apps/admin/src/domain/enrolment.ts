// One row of identity-control's enrolment caller record (ADR-IAM-011 §5.8, amended 2026-10-21;
// TDD-identity-control-001 1.27.0 §Enrolment From an Invitation): a workload admitted to the two
// enrolment routes, active until retired.
export interface EnrolmentCaller {
  readonly principal_id: string;
  readonly purpose: string;
  readonly registered_by: string;
  readonly register_reason: string;
  readonly registered_at: string;
  readonly retired_by: string | null;
  readonly retire_reason: string | null;
  readonly retired_at: string | null;
}

export interface RegisterEnrolmentCallerRequest {
  readonly principal_id: string;
  readonly purpose: string;
}

// The purpose's bounds, as identity-control's request schema states them.
export const purposeMaxLength = 500;

export const isActiveCaller = (caller: EnrolmentCaller): boolean => caller.retired_at === null;
