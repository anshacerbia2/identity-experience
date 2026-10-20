import { load } from 'js-yaml';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import specText from '../../../../contracts/identity-control/openapi.yaml?raw';
import pinText from '../../../../contracts/identity-control/source.json?raw';

// The hand-written Identity Control client, contract-tested against the OpenAPI document
// identity-control publishes (ADR-GLB-010 §5.1, amended 2026-10-20: "where they are hand-written,
// contract-tested in CI against the published specification"; TDD-identity-experience-003 1.32.0
// §The Client Is Contract-Tested). contracts/identity-control/openapi.yaml is that document, copied
// byte for byte at the commit contracts/identity-control/source.json pins.
// scripts/check-identity-control-openapi.mjs compares the copy with identity-control's main in its own
// workflow; this test stays offline.
//
// Two things are checked, both read from the client's source rather than restated here, so a new call
// or a new field is covered the day it is written:
//
// - Every path the client builds under /v1/ names an operation of the document, with the method the
//   call sends when the call is apiGet or a command post.
// - Every field of the client's request and response interfaces is a property of the schema it reads
//   or sends, and every field the client treats as always present is one the document requires.

const sources = import.meta.glob<string>(
  ['../../../../apps/*/src/**/*.{ts,tsx}', '../**/*.{ts,tsx}', '!**/*.test.{ts,tsx}', '!**/test/**'],
  { query: '?raw', import: 'default', eager: true },
);

type Json = Readonly<Record<string, unknown>>;

const spec = load(specText) as Json;
const pin = JSON.parse(pinText) as { readonly version: string; readonly commit: string };

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

// operations is every method and path the document serves, the path with each parameter written x,
// the way a request names one.
const operations: readonly { readonly method: string; readonly path: string; readonly sample: string }[] =
  Object.entries(spec['paths'] as Json).flatMap(([path, item]) =>
    methods
      .filter((method) => isObject(item) && isObject(item[method]))
      .map((method) => ({ method: method.toUpperCase(), path, sample: path.replace(/\{[^}]+\}/g, 'x') })),
  );

// --- The client's calls ------------------------------------------------------------------------

interface Call {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
  readonly method: 'GET' | 'POST' | undefined;
}

const placeholder = '\u0000';

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

const parsed = Object.entries(sources)
  .filter(([file]) => !file.endsWith('routeTree.gen.ts'))
  // Each file by its path from the repository root, as the table below names it.
  .map(([file, text]) => ({
    file: new URL(file, 'file:///repository/packages/app-core/src/api/').pathname.slice(
      '/repository/'.length,
    ),
    source: parse(file, text),
  }));

// helpers maps a function or constant that returns a /v1/ path, `const registrationPath = (id) =>
// \`/v1/registrations/${id}\``, to the path it returns, so a call that builds on it is read whole.
const helpers = new Map<string, ts.Expression>();
for (const { source } of parsed) {
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      let body: ts.Node = node.initializer;
      if (ts.isArrowFunction(body)) {
        body = body.body;
      }
      while (ts.isAsExpression(body) || ts.isParenthesizedExpression(body)) {
        body = body.expression;
      }
      if (
        (ts.isTemplateExpression(body) || ts.isStringLiteralLike(body)) &&
        body.getText().includes('/v1/')
      ) {
        helpers.set(node.name.text, body);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// pathOf reads an expression as a path pattern: its literal text, with each substitution written as
// the placeholder, or a helper's own pattern where the substitution is a helper or names one.
function pathOf(expression: ts.Expression): string | undefined {
  let node = expression;
  while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) {
    node = node.expression;
  }
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      text += (pathOf(span.expression) ?? placeholder) + span.literal.text;
    }
    return text;
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const helper = helpers.get(node.expression.text);
    return helper === undefined ? undefined : pathOf(helper);
  }
  if (ts.isIdentifier(node)) {
    // A local `const base = principalPath(id)`.
    const declaration = helpers.get(node.text);
    if (declaration !== undefined) {
      return pathOf(declaration);
    }
  }
  return undefined;
}

// methodOf is the method of the call an expression is the first argument of: apiGet sends a GET, and
// a command post (useCommandPost's post, or apiPost) a POST.
function methodOf(node: ts.Node): Call['method'] {
  let child = node;
  let parent = node.parent;
  while (ts.isAsExpression(parent) || ts.isParenthesizedExpression(parent)) {
    child = parent;
    parent = parent.parent;
  }
  if (!ts.isCallExpression(parent) || parent.arguments[0] !== child || !ts.isIdentifier(parent.expression)) {
    return undefined;
  }
  switch (parent.expression.text) {
    case 'apiGet':
      return 'GET';
    case 'post':
    case 'apiPost':
      return 'POST';
    default:
      return undefined;
  }
}

const calls: Call[] = [];
for (const { file, source } of parsed) {
  const visit = (node: ts.Node): void => {
    const isPath =
      (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node) || ts.isCallExpression(node)) &&
      !(ts.isTemplateExpression(node.parent) || ts.isTemplateSpan(node.parent));
    const pattern = isPath ? pathOf(node) : undefined;
    if (pattern?.startsWith('/v1/') === true) {
      calls.push({
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        pattern: pattern.split('?')[0] ?? pattern,
        method: methodOf(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// served is whether some operation of the document answers the pattern with the call's method. A
// placeholder stands for one path segment, or the action after a colon.
function served(call: Call): boolean {
  const pattern = new RegExp(`^${call.pattern.split(placeholder).map(escape).join('[^/?]+')}$`);
  return operations.some(
    (operation) =>
      pattern.test(operation.sample) && (call.method === undefined || call.method === operation.method),
  );
}

// --- The client's interfaces ---------------------------------------------------------------------

interface Field {
  readonly name: string;
  readonly optional: boolean;
}

// interfaces is every interface the client declares, by `file#Name`, with its fields and those of an
// interface it extends in the same file.
const interfaces = new Map<string, readonly Field[]>();
for (const { file, source } of parsed) {
  const declared = new Map<string, ts.InterfaceDeclaration>();
  ts.forEachChild(source, (node) => {
    if (ts.isInterfaceDeclaration(node)) {
      declared.set(node.name.text, node);
    }
  });
  const fieldsOf = (node: ts.InterfaceDeclaration): Field[] => {
    const inherited = (node.heritageClauses ?? []).flatMap((clause) =>
      clause.types.flatMap((type) => {
        const parent = ts.isIdentifier(type.expression) ? declared.get(type.expression.text) : undefined;
        return parent === undefined ? [] : fieldsOf(parent);
      }),
    );
    const own = node.members.flatMap((member) =>
      ts.isPropertySignature(member) && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
        ? [{ name: member.name.text, optional: member.questionToken !== undefined }]
        : [],
    );
    return [...inherited, ...own];
  };
  for (const [name, node] of declared) {
    interfaces.set(`${file}#${name}`, fieldsOf(node));
  }
}

// What each request and response interface of the client is, in the document: a schema by name, or
// the body of an operation's answer; `.field` and `[]` walk into it. The table names the pairing only;
// the fields on both sides are read from the source and the document.
const contracts: Readonly<Record<string, string>> = {
  'apps/account/src/features/security/security-api.ts#MySession': 'MySession',
  'apps/account/src/features/security/security-api.ts#MyAuthenticator': 'MyAuthenticator',
  'apps/account/src/features/security/security-api.ts#MyConsent': 'MyConsent',
  'apps/account/src/features/security/security-api.ts#Operation': 'SecurityOperation',
  'apps/account/src/features/security/security-api.ts#NotificationAddress': 'NotificationAddress',
  'apps/admin/src/domain/principal.ts#CreatePrincipalRequest': 'CreatePrincipalRequest',
  'apps/admin/src/domain/principal.ts#PrincipalCreated': 'PrincipalCreated',
  'apps/admin/src/domain/principal.ts#DanglingMapping': 'DanglingFinding',
  'apps/admin/src/domain/principal.ts#RelinkResult': 'PrincipalState',
  'apps/admin/src/domain/principal.ts#PrincipalSweep': 'PrincipalSweepResult',
  'apps/admin/src/domain/principal.ts#UnmappedUser': 'UserFinding',
  'apps/admin/src/domain/principal.ts#ApplicationDeveloper': 'ApplicationDeveloper',
  'apps/admin/src/domain/principal.ts#PendingMapping': 'PendingMapping',
  'apps/admin/src/domain/principal.ts#QuarantinedMapping': 'QuarantinedMapping',
  'apps/admin/src/domain/principal.ts#ReleaseResult': 'post /v1/principals/{principal_id}:release 200',
  'apps/admin/src/domain/principal.ts#PrincipalAdoption': 'PrincipalAdoption',
  'apps/admin/src/domain/principal.ts#AdoptCheck': 'PrincipalAdoption.checks[]',
  'apps/admin/src/domain/ceremony.ts#BootstrapCeremony': 'BootstrapCeremony',
  'apps/admin/src/domain/ceremony.ts#CeremonyReview': 'CeremonyReview',
  'apps/admin/src/domain/security.ts#PrincipalSummary': 'PrincipalSummary',
  'apps/admin/src/domain/security.ts#PrincipalDetail': 'InvestigatedPrincipal',
  'apps/admin/src/domain/security.ts#SecuritySession': 'Session',
  'apps/admin/src/domain/security.ts#Authenticator': 'Authenticator',
  'apps/admin/src/domain/security.ts#FederationLink': 'FederationLink',
  'apps/admin/src/domain/security.ts#KernelEvent': 'PrincipalEvent',
  'apps/admin/src/domain/security.ts#NotificationAddress': 'InvestigatedAddress',
  'apps/admin/src/domain/security.ts#SecurityNotification': 'SecurityNotification',
  'apps/admin/src/domain/security.ts#Finding': 'PrincipalFinding',
  'apps/admin/src/domain/security.ts#SecurityOperation': 'SecurityOperation',
  'apps/admin/src/domain/security.ts#ParkedOperation': 'ParkedOperation',
  'apps/admin/src/domain/security.ts#KernelEventSweep': 'KernelEventSweep',
  'apps/admin/src/domain/projections.ts#EmergencyValidation':
    'get /v1/provider-grants:emergency-validation 200',
  'apps/admin/src/domain/projections.ts#EmergencyGrant': 'EmergencyValidation',
  'apps/admin/src/domain/projections.ts#TenantContextReport': 'TenantContextReport',
  'apps/admin/src/domain/projections.ts#UnconvergedTenant': 'UnconvergedTenant',
  'apps/admin/src/domain/projections.ts#TenantContextSweep': 'TenantSweep',
  'apps/admin/src/domain/temporary-password.ts#TemporaryPasswordAnswer': 'TemporaryPasswordAnswer',
  'apps/admin/src/domain/temporary-password.ts#TemporaryPasswordIssuance':
    'TemporaryPasswordAnswer.temporary_password',
  'apps/admin/src/domain/workload.ts#CreateWorkloadRequest': 'CreateWorkloadRequest',
  'apps/admin/src/domain/workload.ts#WorkloadSweep': 'WorkloadSweepResult',
  'packages/app-core/src/domain/workload.ts#Workload': 'Workload',
  'packages/app-core/src/domain/public-key.ts#PublicJwk': 'PublicJWK',
  'packages/app-core/src/domain/registration.ts#Registration': 'Registration',
  'packages/app-core/src/domain/registration.ts#Finding': 'RegistrationFinding',
  'packages/app-core/src/domain/registration.ts#ReconcileRun': 'ReconcileRun',
  'packages/app-core/src/domain/registration.ts#DriftStatus': 'DriftStatus',
  'packages/app-core/src/domain/registration.ts#DriftException': 'DriftException',
  'packages/app-core/src/domain/registration.ts#ExpiringKeys': 'ExpiringKeys',
  'packages/app-core/src/domain/registration.ts#ExpiringKey': 'ExpiringKeys.registrations[]',
  'packages/app-core/src/domain/registration.ts#ClientKey': 'ClientKey',
  'packages/app-core/src/domain/registration.ts#Owner': 'Owner',
  'packages/app-core/src/domain/registration.ts#RegistrationChange': 'RegistrationChange',
  'packages/app-core/src/domain/registration.ts#RegisterRequest': 'RegisterRequest',
  'packages/app-core/src/domain/registration.ts#RegistrationRequestRecord': 'RegistrationRequest',
};

// Where the document is behind identity-control's code, and the client follows the code. Each entry is
// reported to identity-control; the test fails once the document defines the field, so the entry is
// removed then.
const documentGaps: Readonly<Record<string, string>> = {};

// A request body the client sends, rather than an answer it reads: its name says so.
const isRequest = (name: string): boolean => name.endsWith('Request') || name.endsWith('#PublicJwk');

// resolve follows $ref and merges allOf, so a schema reads as one object.
function resolve(schema: unknown): Json {
  if (!isObject(schema)) {
    return {};
  }
  if (typeof schema['$ref'] === 'string') {
    const name = schema['$ref'].replace('#/components/schemas/', '');
    return resolve(((spec['components'] as Json)['schemas'] as Json)[name]);
  }
  if (Array.isArray(schema['allOf'])) {
    const parts = schema['allOf'].map(resolve);
    return {
      type: 'object',
      properties: Object.assign({}, ...parts.map((part) => part['properties'] ?? {})) as Json,
      required: parts.flatMap((part) => (part['required'] as string[] | undefined) ?? []),
    };
  }
  return schema;
}

// schemaAt reads a contract's target: `Name.field[]`, or `method path status.field`.
function schemaAt(target: string): Json {
  const [head, ...rest] = target.split(' ');
  let schema: Json;
  let walk: string;
  if (rest.length === 0) {
    const [name, ...steps] = (head ?? '').split('.');
    schema = resolve(((spec['components'] as Json)['schemas'] as Json)[name ?? '']);
    walk = steps.join('.');
  } else {
    const [path, statusAndSteps] = rest;
    const [status, ...steps] = (statusAndSteps ?? '').split('.');
    let answer = ((((spec['paths'] as Json)[path ?? ''] as Json)[head ?? ''] as Json)['responses'] as Json)[
      status ?? ''
    ] as Json;
    if (typeof answer['$ref'] === 'string') {
      answer = ((spec['components'] as Json)['responses'] as Json)[
        answer['$ref'].replace('#/components/responses/', '')
      ] as Json;
    }
    schema = resolve(((answer['content'] as Json)['application/json'] as Json)['schema']);
    walk = steps.join('.');
  }
  for (const step of walk === '' ? [] : walk.split('.')) {
    const array = step.endsWith('[]');
    schema = resolve((schema['properties'] as Json | undefined)?.[array ? step.slice(0, -2) : step]);
    if (array) {
      schema = resolve(schema['items']);
    }
  }
  return schema;
}

describe('the hand-written client holds to the OpenAPI document identity-control publishes', () => {
  it('reads the pinned document', () => {
    expect((spec['info'] as Json)['version']).toBe(pin.version);
    expect(pin.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(operations.length).toBeGreaterThan(100);
  });

  it('finds the calls the client makes', () => {
    // Enough to know the source was read: the client makes over sixty.
    expect(calls.length).toBeGreaterThan(60);
  });

  it('names an operation the document serves on every call, with the method it sends', () => {
    const unserved = calls
      .filter((call) => !served(call))
      .map(
        (call) =>
          `${call.file}:${String(call.line)} ${call.method ?? 'any'} ${call.pattern.replaceAll(placeholder, '{…}')}`,
      );
    expect(unserved).toEqual([]);
  });

  it('pairs every interface the table names with one the client declares, and a schema', () => {
    for (const [name, target] of Object.entries(contracts)) {
      expect(interfaces.get(name)?.length ?? 0, name).toBeGreaterThan(0);
      expect(schemaAt(target)['properties'], `${name} → ${target}`).toBeDefined();
    }
  });

  it('reads and sends only fields the document defines', () => {
    const undefinedFields = Object.entries(contracts).flatMap(([name, target]) => {
      const properties = (schemaAt(target)['properties'] ?? {}) as Json;
      return (interfaces.get(name) ?? [])
        .filter((field) => !(field.name in properties) && !(`${name}.${field.name}` in documentGaps))
        .map((field) => `${name}.${field.name}: not a property of ${target}`);
    });
    expect(undefinedFields).toEqual([]);
  });

  it('still needs each gap it excuses in the document', () => {
    const closed = Object.keys(documentGaps).filter((gap) => {
      const [name = '', field = ''] = gap.split(/\.(?=[^.]+$)/);
      const properties = (schemaAt(contracts[name] ?? '')['properties'] ?? {}) as Json;
      return field in properties;
    });
    expect(closed).toEqual([]);
  });

  it('treats a field of an answer as always present only where the document requires it', () => {
    const assumed = Object.entries(contracts)
      .filter(([name]) => !isRequest(name))
      .flatMap(([name, target]) => {
        const required = new Set((schemaAt(target)['required'] as string[] | undefined) ?? []);
        return (interfaces.get(name) ?? [])
          .filter((field) => !field.optional && !required.has(field.name))
          .map((field) => `${name}.${field.name}: always present here, optional in ${target}`);
      });
    expect(assumed).toEqual([]);
  });

  it('always sends every field a request body requires', () => {
    const missing = Object.entries(contracts)
      .filter(([name]) => isRequest(name))
      .flatMap(([name, target]) => {
        const sent = new Map((interfaces.get(name) ?? []).map((field) => [field.name, field.optional]));
        return ((schemaAt(target)['required'] as string[] | undefined) ?? [])
          .filter((field) => sent.get(field) !== false)
          .map((field) => `${name}.${field}: ${target} requires it, and the client may leave it out`);
      });
    expect(missing).toEqual([]);
  });
});
