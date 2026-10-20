// Compares the vendored copy of identity-control's published OpenAPI document,
// contracts/identity-control/openapi.yaml, with the one identity-control's main publishes
// (TDD-identity-experience-003 1.32.0 §The Client Is Contract-Tested, ADR-GLB-010 §5.1).
//
// The applications' client is hand-written. packages/app-core/src/api/identity-control-contract.test.ts
// tests it against the vendored copy, offline, in `pnpm test`. That test cannot see identity-control
// change; this check can. It fails when identity-control's main publishes a document the copy does not
// hold, so the copy is updated and the contract test then says what in the client no longer holds.
//
//   node scripts/check-identity-control-openapi.mjs                  compare with identity-control's main
//   node scripts/check-identity-control-openapi.mjs --ref <ref>      another branch, tag or commit
//   node scripts/check-identity-control-openapi.mjs --update         replace the copy with main's, and pin
//   node scripts/check-identity-control-openapi.mjs --update --ref <ref>
//
// contracts/identity-control/source.json pins the copy: the commit it was read at, the document's
// info.version, and its SHA-256. A copy whose digest is not the pinned one was edited by hand, and the
// check says so before it reads the network.
//
// GITHUB_TOKEN (or GH_TOKEN), when set, authenticates the read; the repository is public, so it only
// raises the rate limit. IDENTITY_CONTROL_REPO overrides `anshacerbia2/identity-control`.
//
// Exit codes: 0 the copy is main's; 1 it differs; 2 the check could not run (the copy edited by hand, or
// identity-control unreachable), which is never reported as agreement.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copyPath = 'contracts/identity-control/openapi.yaml';
const pinPath = 'contracts/identity-control/source.json';
const sourcePath = 'api/openapi.yaml';

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

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// version is the document's info.version: the first two-space-indented `version:` line under `info:`.
function version(text) {
  const match = /^info:\n(?:[ ]{2}.*\n)*?[ ]{2}version: *"?([^"\n]+)"?$/m.exec(text);
  if (match === null) {
    throw new Unreadable('the document has no info.version this check can read');
  }
  return match[1].trim();
}

async function github(url, accept) {
  const headers = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'identity-experience-openapi-check',
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
        return await response.text();
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

const repository = () => process.env.IDENTITY_CONTROL_REPO ?? 'anshacerbia2/identity-control';

// commitOf resolves a branch, tag or commit to its full commit SHA, so the pin names a commit, never
// a branch that moves.
const commitOf = async (ref) =>
  (
    await github(
      `https://api.github.com/repos/${repository()}/commits/${encodeURIComponent(ref)}`,
      'application/vnd.github.sha',
    )
  ).trim();

const documentAt = (ref) =>
  github(
    `https://api.github.com/repos/${repository()}/contents/${sourcePath}?ref=${encodeURIComponent(ref)}`,
    'application/vnd.github.raw+json',
  );

async function main() {
  const ref = argument('--ref') ?? 'main';
  if (process.argv.includes('--update')) {
    const commit = await commitOf(ref);
    const text = await documentAt(commit);
    writeFileSync(path.join(root, copyPath), text);
    const pin = {
      repository: repository(),
      path: sourcePath,
      commit,
      version: version(text),
      sha256: sha256(text),
    };
    writeFileSync(path.join(root, pinPath), `${JSON.stringify(pin, null, 2)}\n`);
    process.stdout.write(
      `${copyPath} is now ${pin.repository}@${commit} (info.version ${pin.version}). ` +
        'Run `pnpm test`: the contract test says what in the client no longer holds.\n',
    );
    return 0;
  }

  const copy = readFileSync(path.join(root, copyPath), 'utf8');
  const pin = JSON.parse(readFileSync(path.join(root, pinPath), 'utf8'));
  if (sha256(copy) !== pin.sha256) {
    throw new Unreadable(
      `${copyPath} is not the document ${pinPath} pins (its SHA-256 differs): it is identity-control's, ` +
        'never edited here. Restore it, or replace it with --update.',
    );
  }
  const published = await documentAt(ref);
  const from = `${repository()}@${ref}`;
  if (published === copy) {
    process.stdout.write(
      `${copyPath} is the document ${from} publishes (info.version ${pin.version}, pinned at ${pin.commit}).\n`,
    );
    return 0;
  }
  process.stderr.write(
    `${copyPath} differs from ${sourcePath} at ${from}:\n` +
      `  - the copy: info.version ${pin.version}, read at ${pin.commit}\n` +
      `  - ${from}: info.version ${version(published)}\n` +
      'Replace the copy with `node scripts/check-identity-control-openapi.mjs --update`, then run ' +
      '`pnpm test`: the contract test names each route or field of the client the document no longer holds.\n',
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
