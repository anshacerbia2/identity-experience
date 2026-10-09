// What the stand-in Identity Control API answers, per path: enough of each read for every main page
// to render its tables, states and empty states, in the shapes identity-control serves. The values are
// invented; the shapes are the applications' contracts (apps/*/src/domain, packages/app-core).
import { operatorPrincipal, registrationId, subjectPrincipal } from './shared.js';

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
  '/v1/registrations': { registrations: [registration], next: null },
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
  '/v1/registrations:changes': { changes: [] },
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
  '/v1/principals:unmapped': { unmapped: [] },
  '/v1/principals:search': { principals: [] },
  '/v1/security-operations:unresolved': { operations: [] },
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
    ],
  },
  '/v1/me/authenticators': {
    authenticators: [
      { security_ref: 'k1.password', type: 'password', created: at(40) },
      { security_ref: 'k1.otp', type: 'otp', label: 'phone', created: at(30) },
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
        origin: 'creation',
        state: 'active',
        added_at: at(40),
        verified_at: at(40),
      },
    ],
  },
};

// fixture is the body for a path, or undefined: the stand-in answers 404 then, as the API does for a
// path it does not serve.
export function fixture(path: string): unknown {
  return answers[path];
}
