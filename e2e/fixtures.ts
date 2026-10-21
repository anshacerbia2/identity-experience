// What the stand-in Identity Control API answers, per path: enough of each read for every main page
// to render its tables, states and empty states, in the shapes identity-control serves. The values are
// invented; the shapes are the applications' contracts (apps/*/src/domain, packages/app-core).
import { operatorPrincipal, orphanPrincipal, registrationId, subjectPrincipal } from './shared.js';

const at = (daysAgo: number): string => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

const registration = {
  registration_id: registrationId,
  realm: 'scnehaux',
  client_key: 'billing-portal',
  profile: 'confidential',
  audience_class: 'internal',
  application_authority: 'billing',
  application_ref: 'billing-portal',
  registered_by: operatorPrincipal,
  signing_algorithm: 'PS256',
  lifetime_class: 'L1',
  audience: ['billing-api'],
  redirect_uris: ['https://billing.example.com/auth/callback'],
  backchannel_logout_uri: 'https://billing.example.com/auth/back-channel-logout',
  consent_required: false,
  state: 'active',
  version: 3,
  created_at: at(30),
};

const workload = {
  principal_id: '0192f0e0-4444-7000-8000-000000000009',
  registration_id: '0192f0e0-1111-7000-8000-000000000002',
  client_key: 'invoice-batch',
  display_name: 'Invoice batch',
  purpose: 'Nightly invoice export',
  workload_type: 'service',
  owner_principal_id: operatorPrincipal,
  team_reference: 'billing',
  owner_recorded_at: at(20),
  state: 'active',
  orphaned_at: null,
  last_seen_at: at(1),
  created_by: operatorPrincipal,
  created_at: at(20),
  activated_at: at(20),
  last_reviewed_at: at(10),
  review_due_at: at(-80),
};

const answers: Readonly<Record<string, unknown>> = {
  '/v1/registrations': {
    registrations: [
      registration,
      // A partner's client: external, so it asks each person's consent (STD-IAM-002 1.9.0 §3.6).
      {
        ...registration,
        registration_id: '0192f0e0-1111-7000-8000-000000000003',
        client_key: 'partner-travel-portal',
        audience_class: 'external',
        consent_required: true,
        backchannel_logout_uri: undefined,
      },
    ],
    next: null,
  },
  [`/v1/registrations/${registrationId}`]: registration,
  [`/v1/registrations/${registrationId}/findings`]: { findings: [] },
  [`/v1/registrations/${registrationId}/drift-exceptions`]: { exceptions: [] },
  [`/v1/registrations/${registrationId}/keys`]: { keys: [] },
  [`/v1/registrations/${registrationId}/owners`]: {
    owners: [
      {
        ownership_id: '0192f0e0-5555-7000-8000-000000000001',
        registration_id: registrationId,
        principal_id: operatorPrincipal,
        granted_by: operatorPrincipal,
        grant_reason: 'first owner',
        granted_at: at(30),
        revoked_at: null,
        revoked_by: null,
        active: true,
      },
    ],
  },
  [`/v1/registrations/${registrationId}/changes`]: { changes: [] },
  '/v1/registrations:drift': {
    last_run: {
      run_id: '0192f0e0-6666-7000-8000-000000000001',
      started_at: at(0.01),
      finished_at: at(0.009),
      outcome: 'converged',
      attribution: true,
      findings: 0,
    },
    last_run_findings: [],
    findings: [],
  },
  '/v1/registrations:expiring-keys': { warning_days: 14, critical_days: 3, registrations: [] },
  '/v1/registrations:changes': {
    changes: [
      {
        change_id: '0192f0e0-7777-7000-8000-000000000001',
        registration_id: registrationId,
        client_key: 'billing-portal',
        base_version: 3,
        kind: 'backchannel_logout_uri',
        previous_redirect_uris: null,
        redirect_uris: null,
        previous_audience: null,
        audience: null,
        previous_lifetime_class: null,
        lifetime_class: null,
        previous_backchannel_logout_uri: 'https://billing.example.com/auth/back-channel-logout',
        backchannel_logout_uri: null,
        approval_required: true,
        proposed_by: subjectPrincipal,
        proposal_reason: 'The billing BFF is retired',
        proposed_at: at(1),
        state: 'proposed',
        decided_by: null,
        decided_at: null,
      },
    ],
  },
  '/v1/registrations:mine': { registrations: [registration] },
  '/v1/registrations:standing': {
    provider: true,
    application_developer: true,
    environment: 'non-production',
  },
  '/v1/registration-requests': { requests: [] },
  '/v1/registration-requests:mine': { requests: [] },
  '/v1/application-developers': { developers: [] },
  '/v1/principals:dangling': { dangling: [] },
  // An orphan a restore to an older point left behind: its identifier is offered for adoption
  // (TDD-identity-experience-003 1.32.0).
  '/v1/principals:unmapped': {
    unmapped: [
      {
        finding_id: '0192f0e0-ffff-7000-8000-000000000001',
        finding_class: 'orphan',
        claimed_principal_id: orphanPrincipal,
        username: 'restored.after.backup',
        user_disabled: false,
        detected_at: at(0.1),
      },
    ],
  },
  // The bootstrap ceremony's record, unreviewed, run by people other than the one signed in, so the
  // review is offered (STD-IAM-001 2.9.0 §3.10).
  '/v1/bootstrap-ceremony': {
    operator: 'Oscar Operator',
    witness: 'Wendy Witness',
    reason: 'First provider for the development estate, CHG-2026-0001, run from the bootstrap runbook',
    principal_id: subjectPrincipal,
    requested_at: at(30),
    reviewed: false,
    reviews: [],
  },
  // A person's consents: a partner's client with a registered lifetime, and one no registration
  // describes, with a long scope list (TDD-identity-experience-002 1.11.0).
  '/v1/me/consents': {
    consents: [
      {
        security_ref: 'k1.consent.partner',
        client: 'partner-travel-portal',
        scopes: ['openid', 'scnehaux-profile'],
        granted_at: at(10),
        updated_at: null,
        access_token_lifetime_seconds: 300,
      },
      {
        security_ref: 'k1.consent.legacy',
        client: 'regional-finance-reporting-partner-integration',
        scopes: [
          'openid',
          'scnehaux-profile',
          'partner-travel-bookings-read',
          'partner-expense-reports-read',
        ],
        granted_at: at(20),
        access_token_lifetime_seconds: null,
      },
    ],
  },
  '/v1/principals:search': { principals: [] },
  '/v1/security-operations:unresolved': { operations: [] },
  '/v1/principals:quarantined': {
    quarantined: [
      {
        principal_id: '0192f0e0-3333-7000-8000-0000000000aa',
        subject_type: 'human',
        username: 'grace',
        quarantined_at: at(3),
        quarantine_reason: 'duplicate',
        linked: true,
      },
    ],
  },
  '/v1/principals:pending': {
    pending: [
      {
        principal_id: '0192f0e0-5555-7000-8000-0000000000bb',
        subject_type: 'human',
        username: 'new.joiner',
        created_at: at(1),
        overdue: true,
      },
    ],
  },
  '/v1/projections/tenant-context:unconverged': {
    tenants: [
      {
        tenant_id: '0192f0e0-eeee-7000-8000-000000000001',
        state: 'unresolved',
        priority: true,
        sweep: false,
        attempts: 8,
        last_error_class: 'forbidden',
        marked_at: at(1),
        delivered_at: at(1),
        next_attempt_at: at(0),
      },
    ],
  },
  [`/v1/principals/${subjectPrincipal}`]: {
    principal_id: subjectPrincipal,
    username: 'alice',
    email: 'alice@example.com',
    subject_type: 'human',
    state: 'active',
    realm: 'scnehaux',
    created_at: at(40),
    activated_at: at(40),
    quarantined_at: null,
    version: 2,
    security_version: 4,
  },
  '/v1/workloads:mine': { workloads: [workload] },
  '/v1/workloads:orphaned': { workloads: [] },
  '/v1/workloads:unused': { workloads: [] },
  '/v1/workloads:reviews-overdue': { workloads: [] },
  // The enrolment caller record (TDD-identity-experience-003 1.35.0 §Enrolment Callers): one active
  // caller, the e2e stack's own enrolment workload, and one retired, with long reasons.
  '/v1/enrolment-callers': {
    enrolment_callers: [
      {
        principal_id: '0192f0e0-8888-7000-8000-000000000001',
        purpose: 'The enrolment BFF of a laptop that was replaced after its disk failed',
        registered_by: 'prn_01TESTPRINCIPAL',
        register_reason: 'Wiring the enrolment page on the old laptop, per deploy/dev/README.md',
        registered_at: '2026-10-20T08:00:00Z',
        retired_by: 'prn_01TESTPRINCIPAL',
        retire_reason: 'The laptop was replaced; its enrolment workload is retired with it, INC-7',
        retired_at: '2026-10-21T08:00:00Z',
      },
      {
        principal_id: '0192f0e0-7777-7000-8000-000000000001',
        purpose: 'The enrolment BFF of the browser test stack',
        registered_by: 'prn_01TESTPRINCIPAL',
        register_reason: 'Wiring the enrolment page for the browser tests',
        registered_at: '2026-10-21T09:00:00Z',
        retired_by: null,
        retire_reason: null,
        retired_at: null,
      },
    ],
  },
  '/v1/provider-grants:emergency-validation': {
    scope: 'provider:identity-control',
    validation_period_days: 90,
    grants: [
      {
        grant_id: '0192f0e0-cccc-7000-8000-000000000001',
        principal_id: subjectPrincipal,
        held_since: at(120),
        last_used_at: null,
        uses: 0,
        due_at: at(30),
        overdue: true,
      },
      {
        grant_id: '0192f0e0-cccc-7000-8000-000000000002',
        principal_id: operatorPrincipal,
        held_since: at(120),
        last_used_at: at(5),
        uses: 2,
        due_at: at(-85),
        overdue: false,
      },
    ],
  },
  '/v1/projections/tenant-context/report': {
    consumer_id: 'identity-control',
    mark: 4217,
    rows: [{ membership_id: '0192f0e0-dddd-7000-8000-000000000001', membership_version: 7 }],
  },
  '/v1/me/sessions': {
    sessions: [
      {
        security_ref: 'k1.this',
        started: at(0.01),
        last_access: at(0),
        clients: ['identity-experience'],
        current: true,
      },
      {
        security_ref: 'k1.other',
        started: at(2),
        last_access: at(1),
        clients: ['identity-experience'],
        current: false,
      },
      // Long content, as a real account has it: a session that reached many applications.
      {
        security_ref: 'k1.many',
        started: at(6),
        last_access: at(3),
        clients: [
          'identity-experience',
          'billing-portal',
          'organization-experience-admin',
          'reporting-dashboard-for-regional-finance-operations',
        ],
        current: false,
      },
    ],
  },
  '/v1/me/authenticators': {
    authenticators: [
      { security_ref: 'k1.password', type: 'password', created: at(40) },
      { security_ref: 'k1.otp', type: 'otp', label: 'phone', created: at(30) },
      {
        security_ref: 'k1.otp2',
        type: 'otp',
        label: 'Work phone, the one in the second drawer',
        created: at(25),
      },
      { security_ref: 'k1.otp3', type: 'otp', label: 'tablet', created: at(20) },
      { security_ref: 'k1.key1', type: 'webauthn', label: 'YubiKey 5C NFC (blue keyring)', created: at(15) },
      { security_ref: 'k1.key2', type: 'webauthn-passwordless', label: 'Laptop', created: at(10) },
      {
        security_ref: 'k1.codes',
        type: 'recovery-authn-codes',
        created: at(30),
        remaining_codes: 12,
        total_codes: 12,
      },
    ],
  },
  '/v1/me/notification-addresses': {
    notification_addresses: [
      {
        address_id: '0192f0e0-aaaa-7000-8000-000000000001',
        channel: 'email',
        address: 'ada@example.com',
        origin: 'added',
        state: 'active',
        added_at: at(40),
        verified_at: at(40),
      },
      {
        address_id: '0192f0e0-aaaa-7000-8000-000000000002',
        channel: 'email',
        address: 'ada@work.example',
        origin: 'creation',
        state: 'active',
        added_at: at(40),
        proof_expires_at: at(-0.005),
      },
      // A long address with no break opportunity but its own punctuation.
      {
        address_id: '0192f0e0-aaaa-7000-8000-000000000003',
        channel: 'email',
        address: 'ada.lovelace.analytical-engine.notes@research-department.very-long-subdomain.example.org',
        origin: 'added',
        state: 'pending',
        added_at: at(1),
      },
    ],
  },
};

// fixture is the body for a path, or undefined: the stand-in answers 404 then, as the API does for a
// path it does not serve.
export function fixture(path: string): unknown {
  return answers[path];
}
