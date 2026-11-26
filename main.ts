// Token Radar, radar-4: the program that turns the sealed snapshot into the entry.
//
// Reads /input/snapshot.json (or --input <file|dir>), fits the radar-4 model on the snapshot's
// own tokened peers and validates it held-out (see lib/model.ts), scores all 758 protocols
// into the ranked board, writes the dashboard's dataset as /output/data.js, copies this
// repository's dashboard/ and screenshots/ into /output, and writes /output/dossier.json with
// the vendored make.fun dossier library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier's bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const inputArg = flag('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const out = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

// The dashboard must be self-contained: no external reference anywhere in its source.
const dashDir = join(here, 'dashboard');
for (const name of readdirSync(dashDir)) {
  const path = join(dashDir, name);
  if (!statSync(path).isFile()) continue;
  if (/https?:\/\//.test(readFileSync(path, 'utf8'))) {
    fail(`dashboard/${name} references the network: the dashboard is offline-only`);
  }
}

const dashFiles = copyDir(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyDir(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  }
  // A whole JPEG or PNG, by magic bytes: the gate refuses a truncated image.
  const head = readFileSync(join(out, 'screenshots', name)).subarray(0, 4);
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  if (!isJpeg && !isPng) {
    fail(`screenshots/${name}: not a whole JPEG or PNG`);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
const dossierOpts = { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } };
writeFileSync(join(out, 'dossier.json'), buildDossier(out, dossierOpts));
// Re-read what was written and compare against a fresh build: a dossier that does not survive
// its own rebuild is not the dossier the gate compares against.
const written = readFileSync(join(out, 'dossier.json'));
const rebuilt = buildDossier(out, dossierOpts);
if (!written.equals(Buffer.from(rebuilt))) {
  fail('dossier.json does not match a fresh buildDossier of this /output');
}

const top = board[0]!;
const firstCandidate = board.find((r) => r.token_status === 'pre-token')!;
const v = radar.validation;
const m = radar.model;
const dossierBytes = written.length;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.pre_token_size} pre-token, ${radar.live_size} live, ${radar.excluded_size} excluded)\n` +
    `token radar: model radar-4 fitted on ${m.peers_kept} of ${m.peers} tokened peers (trimmed ${m.peers_trimmed}: ${m.trimmed_slugs.join(', ')}): log10(mcap) = ${m.intercept} + ${m.log_tvl}*log10(TVL) ${m.log_chains < 0 ? '−' : '+'} ${Math.abs(m.log_chains)}*log10(chains), R2=${m.r2} (kept ${m.r2_kept})\n` +
    `token radar: validation: leave-one-out median x${v.loo_median_multiple} (${Math.round(v.loo_within_2x * 100)}% within 2x, n=${v.loo_n}); walk-forward 70/30 median x${v.walk_forward_70_median_multiple} (cutoff ${v.walk_forward_70_cutoff}); 80% interval x${v.conformal_80_factor}\n` +
    `token radar: rank 1 is ${top.name} (${top.token_status}) at $${top.implied_value_usd.toLocaleString('en-US')} implied; top launch candidate is ${firstCandidate.name} at $${firstCandidate.implied_value_usd.toLocaleString('en-US')}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')} (${dossierBytes.toLocaleString('en-US')} bytes)\n`,
);
