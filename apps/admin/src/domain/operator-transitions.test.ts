import { describe, expect, it } from 'vitest';

import design from '../../../../docs/designs/TDD-identity-experience-003-administration-and-investigation.md?raw';

// TDD-identity-experience-003 1.27.0 §Operator Transitions. Every mutating route identity-control
// classifies in internal/httpapi/commands.go (STD-GLB-001 1.4.0 §Commands Require an Idempotency-Key),
// as it stands at identity-control 138f29d, with identity-control's adr-iam-010 branch (ADR-IAM-010,
// ADR-ORG-007): :issue-temporary-password and :send-proof under routes already listed, and
// identifiers:match, Organization Control's question (TDD-identity-experience-003 1.28.0): the serviceKeyed, replayedKey and keyOptional tables, and
// adoptKey. identity-control's TestEveryMutatingRouteIsClassified holds every mutating route in one of
// them, so this list is every command it serves. When it classifies a new route, the route is added
// here, and this test then fails until the design's table says what these applications offer for it.
const classified: readonly string[] = [
  // serviceKeyed
  'POST /v1/principals',
  'POST /v1/principals/{target}',
  'POST /v1/registrations',
  'POST /v1/workloads',
  'POST /v1/me/sessions/{session_action}',
  'POST /v1/me/sessions:terminate-all',
  'POST /v1/me/authenticators/{authenticator_action}',
  'POST /v1/principals/{principal_id}/sessions:terminate-all',
  'POST /v1/principals/{principal_id}/authenticators/{authenticator_action}',
  // replayedKey
  'POST /v1/registrations/{registration_id}',
  'POST /v1/registrations/{registration_id}/drift-exceptions',
  'POST /v1/registrations/{registration_id}/keys',
  'POST /v1/registrations/{registration_id}/keys/{key_action}',
  'POST /v1/registrations/{registration_id}/owners',
  'POST /v1/registrations/{registration_id}/owners/{owner_action}',
  'POST /v1/registrations/{registration_id}/changes',
  'POST /v1/registrations/{registration_id}/changes/{change_action}',
  'POST /v1/application-developers',
  'POST /v1/application-developers/{developer_action}',
  'POST /v1/registration-requests',
  'POST /v1/registration-requests/{request_action}',
  'POST /v1/workloads/{target}',
  'POST /v1/security-operations/{operation_action}',
  'POST /v1/me/notification-addresses',
  'POST /v1/me/notification-addresses/{address_action}',
  // adoptKey
  'POST /v1/registrations:adopt',
  // keyOptional
  'POST /v1/principals:reconcile',
  'POST /v1/registrations:reconcile',
  'POST /v1/workloads:sweep',
  'POST /v1/kernel-events:sweep',
  'POST /v1/me/authenticators:enroll',
  'POST /v1/projections/tenant-context:sweep',
  'POST /v1/projections/tenant-context/tenants/{tenant_action}',
  'POST /v1/deliveries',
  'POST /v1/principals/{principal_id}/identifiers:match',
];

interface Row {
  readonly route: string;
  readonly action: string;
  readonly driver: string;
  readonly offered: string;
}

// rows is every row of the section's one table whose first cell is a route.
function rows(): Row[] {
  const section = design.split('### Operator Transitions (1.27.0)')[1]?.split('\n### ')[0] ?? '';
  const found: Row[] = [];
  for (const line of section.split('\n')) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const [route, action, driver, offered] = cells;
    if (cells.length !== 4 || route === undefined || !route.startsWith('`POST ')) {
      continue;
    }
    found.push({
      route: route.replaceAll('`', ''),
      action: action ?? '',
      driver: driver ?? '',
      offered: offered ?? '',
    });
  }
  return found;
}

describe('every identity-control command has a row in the operator transitions table', () => {
  it('reads the table', () => {
    expect(rows().length).toBeGreaterThanOrEqual(classified.length);
  });

  it('has a row for each classified route', () => {
    const routes = new Set(rows().map((row) => row.route));
    expect(classified.filter((route) => !routes.has(route))).toEqual([]);
  });

  it('names no route identity-control does not classify', () => {
    const known = new Set(classified);
    expect(rows().filter((row) => !known.has(row.route))).toEqual([]);
  });

  it('names the action, who drives it, and what is offered or why nothing is', () => {
    for (const row of rows()) {
      expect(row.action, row.route).toMatch(/\S/);
      expect(row.driver, row.route).toMatch(/\S/);
      if (row.offered.startsWith('None')) {
        // A None states its reason after it.
        expect(row.offered, row.route).toMatch(/^None[,:]\s*\S.{10,}/);
      } else {
        expect(row.offered, row.route).toMatch(/^(Admin Portal|Developer Console|Account application)/);
      }
    }
  });

  it('offers the release, and the Tenant context re-drive and sweep, that 1.27.0 added', () => {
    const offered = (route: string, action: string) =>
      rows().find((row) => row.route === route && row.action.includes(action))?.offered ?? '';
    expect(offered('POST /v1/principals/{target}', ':release')).toMatch(/Release/);
    expect(offered('POST /v1/projections/tenant-context/tenants/{tenant_action}', ':redrive')).toMatch(
      /Re-drive/,
    );
    expect(offered('POST /v1/projections/tenant-context:sweep', 'sweep')).toMatch(/sweep now/);
  });
});
