// Compares the classified command list in apps/admin/src/domain/operator-transitions.test.ts with
// identity-control's internal/httpapi/commands.go, as identity-control's main holds it
// (TDD-identity-experience-003 1.31.0 §Operator Transitions).
//
// The test's list is a copy: it makes the design's table cover every command identity-control
// serves, but it cannot see identity-control change. This check can. It fails when a table there
// gained, lost or moved a route that the copy does not show, so the copy and then the table are
// brought up to date.
//
// The unit tests stay offline: the network call is here, in its own CI workflow
// (.github/workflows/identity-control-commands.yml), never in `pnpm test`.
//
//   node scripts/check-identity-control-commands.mjs                  identity-control's main
//   node scripts/check-identity-control-commands.mjs --ref <branch>   another branch, tag or commit
//   node scripts/check-identity-control-commands.mjs --file <path>    a local commands.go, offline
//
// GITHUB_TOKEN (or GH_TOKEN), when set, authenticates the read; the repository is public, so it only
// raises the rate limit. IDENTITY_CONTROL_REPO overrides `anshacerbia2/identity-control`.
//
// Exit codes: 0 the lists agree; 1 they differ; 2 the check could not run (a file of an unexpected
// shape, or identity-control unreachable), which is never reported as agreement.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copyPath = 'apps/admin/src/domain/operator-transitions.test.ts';
const sourcePath = 'internal/httpapi/commands.go';

// The tables of commands.go, in its order. adoptKey is a single constant, the others are maps.
const tables = ['serviceKeyed', 'replayedKey', 'adoptKey', 'keyOptional'];

class Unreadable extends Error {}

function argument(name) {
  const at = process.argv.indexOf(name);
  if (at === -1) {
    return undefined;
  }
  const value = process.argv[at + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Unreadable(`${name} needs a value`);
  }
  return value;
}

// parseSource reads each table's routes from commands.go. Each map's keys are the lines that start
// with a quoted method and path followed by a colon; a continued reason never starts that way.
function parseSource(text) {
  const found = new Map();
  for (const table of tables) {
    if (table === 'adoptKey') {
      const match = /^const adoptKey = "([^"]+)"/m.exec(text);
      if (match === null) {
        throw new Unreadable(`${sourcePath} declares no const adoptKey`);
      }
      found.set(table, [match[1]]);
      continue;
    }
    const block = new RegExp(`^var ${table} = map\\[string\\]string\\{\\n([\\s\\S]*?)^\\}`, 'm').exec(text);
    if (block === null) {
      throw new Unreadable(`${sourcePath} declares no var ${table} = map[string]string{...}`);
    }
    const routes = [...block[1].matchAll(/^\s*"([A-Z]+ \/[^"]*)"\s*:/gm)].map((m) => m[1]);
    if (routes.length === 0) {
      throw new Unreadable(`${sourcePath}: ${table} holds no route this check can read`);
    }
    found.set(table, routes);
  }
  return found;
}

// parseCopy reads the test's `classified` array: a `// <table>` comment line names the table the
// quoted routes after it belong to.
function parseCopy(text) {
  const block = /^const classified: readonly string\[\] = \[\n([\s\S]*?)^\];/m.exec(text);
  if (block === null) {
    throw new Unreadable(`${copyPath} declares no const classified: readonly string[] = [...]`);
  }
  const found = new Map();
  let table;
  for (const line of block[1].split('\n')) {
    const heading = /^\s*\/\/\s*(\w+)\s*$/.exec(line);
    const route = /^\s*'([^']+)',?\s*$/.exec(line);
    if (heading !== null) {
      table = heading[1];
      if (!tables.includes(table)) {
        throw new Unreadable(`${copyPath}: "// ${table}" names no table of ${sourcePath}`);
      }
      found.set(table, found.get(table) ?? []);
    } else if (route !== null) {
      if (table === undefined) {
        throw new Unreadable(`${copyPath}: '${route[1]}' comes before any // <table> comment`);
      }
      found.get(table).push(route[1]);
    } else if (line.trim() !== '') {
      throw new Unreadable(`${copyPath}: a line of classified this check cannot read: ${line.trim()}`);
    }
  }
  return found;
}

// differences lists, per table, what identity-control holds that the copy lacks and the reverse,
// and any route the copy lists twice.
function differences(source, copy) {
  const found = [];
  const seen = new Set();
  for (const table of tables) {
    const want = source.get(table) ?? [];
    const have = copy.get(table) ?? [];
    for (const route of want.filter((r) => !have.includes(r))) {
      found.push(`${table}: identity-control classifies ${route}; the copy does not list it here`);
    }
    for (const route of have.filter((r) => !want.includes(r))) {
      found.push(`${table}: the copy lists ${route}; identity-control does not classify it here`);
    }
    for (const route of have) {
      if (seen.has(route)) {
        found.push(`${table}: the copy lists ${route} twice`);
      }
      seen.add(route);
    }
  }
  return found;
}

async function fetchSource(ref) {
  const repo = process.env.IDENTITY_CONTROL_REPO ?? 'anshacerbia2/identity-control';
  const url = `https://api.github.com/repos/${repo}/contents/${sourcePath}?ref=${encodeURIComponent(ref)}`;
  const headers = {
    Accept: 'application/vnd.github.raw+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'identity-experience-command-check',
  };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let last;
  // Three attempts, a few seconds apart: a transient failure of the API is not a difference, and an
  // unreachable identity-control is reported as such (exit 2), never as agreement.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        return { text: await response.text(), from: `${repo}@${ref}` };
      }
      last = `${response.status} ${response.statusText}`;
      if (response.status === 404) {
        break;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 3_000));
  }
  throw new Unreadable(`${url} could not be read: ${last}`);
}

async function main() {
  const file = argument('--file');
  const source = file
    ? { text: readFileSync(file, 'utf8'), from: path.resolve(file) }
    : await fetchSource(argument('--ref') ?? 'main');
  const classified = parseSource(source.text);
  const found = differences(classified, parseCopy(readFileSync(path.join(root, copyPath), 'utf8')));
  if (found.length === 0) {
    const count = [...classified.values()].flat().length;
    process.stdout.write(
      `${copyPath} lists the ${count} routes ${source.from} classifies, table by table.\n`,
    );
    return 0;
  }
  process.stderr.write(
    `${copyPath} differs from ${sourcePath} at ${source.from}:\n` +
      found.map((difference) => `  - ${difference}\n`).join('') +
      'Update the copy, then the TDD-identity-experience-003 §Operator Transitions table, as its ' +
      'bullets describe; `pnpm test` then says which row is missing.\n',
  );
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`${error instanceof Unreadable ? error.message : String(error)}\n`);
    process.exit(2);
  },
);
