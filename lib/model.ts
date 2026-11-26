// Token Radar, radar-4 — the model: sealed snapshot in, ranked board out.
//
// The whole entry is a function of the snapshot. The model is trimmed least
// squares on log10(market cap), fitted at run time on the snapshot's own
// tokened protocols, validated held-out before it scores anything, then
// applied to all 758 protocols with two bounded adjustments (momentum and
// maturity) and a costed farm plan per row. Nothing is hardcoded by name:
// the same code on a different snapshot would fit a different line.
//
// Numbers the fit must reproduce (see dashboard/MODEL.md for the story):
//   log10(mcap) = 3.0161 + 0.5417*log10(TVL) - 0.2248*log10(chains), R2 0.236
//   leave-one-out median x2.844, walk-forward 70/30 median x2.568,
//   walk-forward 60/40 median x2.525, 80% interval x10.115.
//
// Two precisions run side by side on purpose. Validation refits and scores
// with the full-precision coefficients, because a held-out error should be
// measured on the fit as fitted. The board itself is scored with the
// published four-decimal coefficients, so the numbers a reader sees in
// MODEL.md and the numbers the board uses are the same numbers.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export type TokenStatus = 'pre-token' | 'live' | 'excluded';

export interface RowModel {
  fitted_log_value: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  raw_prediction_usd: number;
  interval_low_usd: number;
  interval_high_usd: number;
  age_days: number | null;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: TokenStatus;
  exclusion_reason: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  launch_odds: number;
  interval_low_usd: number;
  interval_high_usd: number;
  model: RowModel;
  farm_steps: string[];
}

export interface RadarModel {
  version: 'radar-4';
  peers: number;
  peers_kept: number;
  peers_trimmed: number;
  peers_excluded_dust: number;
  peers_excluded_chain_cex: number;
  trimmed_slugs: string[];
  intercept: number;
  log_tvl: number;
  log_chains: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  trim_fraction: number;
  r2: number;
  r2_kept: number;
}

export interface RadarValidation {
  loo_median_multiple: number;
  loo_within_2x: number;
  loo_n: number;
  walk_forward_70_cutoff: string;
  walk_forward_70_train: number;
  walk_forward_70_test: number;
  walk_forward_70_median_multiple: number;
  walk_forward_70_within_2x: number;
  walk_forward_60_cutoff: string;
  walk_forward_60_train: number;
  walk_forward_60_test: number;
  walk_forward_60_median_multiple: number;
  walk_forward_60_within_2x: number;
  conformal_80_factor: number;
}

export interface Radar {
  as_of: string;
  source: string;
  floor_usd: number;
  model: RadarModel;
  validation: RadarValidation;
  rows: BoardRow[];
  watchlist_size: number;
  pre_token_size: number;
  live_size: number;
  excluded_size: number;
}

// ---- constants of the model (the fitted weights are the published ones) ----
const GROWTH_WEIGHT = 0.25;
const GROWTH_FLOOR = -60;
const GROWTH_CAP = 120;
const MATURITY_FLOOR = 0.9;
const MATURITY_RANGE = 0.2;
const MATURITY_DAYS = 1095;
const UNKNOWN_AGE_DAYS = 365;
const TRIM_FRACTION = 0.1;
const DUST_RATIO = 0.005;
const PEER_CATEGORIES_OUT = new Set(['Chain', 'CEX']);
const DAY_MS = 86_400_000;

// ---- tiny numeric helpers ---------------------------------------------------
const log10 = (x: number): number => Math.log10(x);
function roundTo(x: number, places: number): number {
  const f = 10 ** places;
  return Math.round(x * f) / f;
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
// The median this codebase uses: the upper of the two middle values when
// the count is even (sorted[floor(n/2)]). For odd counts it is the middle.
function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}
function errorMultiple(predicted: number, actual: number): number {
  return Math.max(predicted / actual, actual / predicted);
}

// ---- snapshot ----------------------------------------------------------------
/** Parse the sealed snapshot; throws on anything that is not its shape. */
export function parseSnapshot(text: string): Snapshot {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('snapshot is not an object');
  const snap = parsed as Snapshot;
  if (typeof snap.as_of !== 'string' || typeof snap.source !== 'string' || !Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist)) {
    throw new Error('snapshot is missing as_of, source, protocols or watchlist');
  }
  return snap;
}

/** Whole days from a protocol's listing to the snapshot date; null when unlisted. */
export function ageInDays(p: SnapshotProtocol, asOf: Date): number | null {
  if (p.listed_at === null) return null;
  return Math.round((asOf.getTime() - new Date(`${p.listed_at}T00:00:00Z`).getTime()) / DAY_MS);
}

// ---- least squares on [1, log10 TVL, log10 chains] ----------------------------
// The design has three terms, so the normal equations are a 3x3 system and
// a small Gaussian elimination with partial pivoting solves them exactly.
function designRow(p: SnapshotProtocol): [number, number, number] {
  return [1, log10(p.tvl_usd), log10(p.chains.length)];
}

function solve3x3(a: number[][], b: number[]): [number, number, number] {
  const m: number[][] = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = col + 1; r < 3; r++) {
      const f = m[r]![col]! / m[col]![col]!;
      for (let k = col; k < 4; k++) m[r]![k]! -= f * m[col]![k]!;
    }
  }
  const x: [number, number, number] = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let s = m[r]![3]!;
    for (let k = r + 1; k < 3; k++) s -= m[r]![k]! * x[k]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}

interface LeastSquares {
  beta: [number, number, number];
  r2: number;
  residuals: number[];
}

function leastSquares(rows: SnapshotProtocol[]): LeastSquares {
  const ata: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const atb: number[] = [0, 0, 0];
  const ys = rows.map((p) => log10(p.mcap_usd!));
  const yMean = ys.reduce((a, y) => a + y, 0) / ys.length;
  rows.forEach((p, i) => {
    const x = designRow(p);
    for (let a = 0; a < 3; a++) {
      for (let c = 0; c < 3; c++) ata[a]![c]! += x[a]! * x[c]!;
      atb[a]! += x[a]! * ys[i]!;
    }
  });
  const beta = solve3x3(ata, atb);
  let ssRes = 0;
  let ssTot = 0;
  const residuals = rows.map((p, i) => {
    const x = designRow(p);
    const fitted = beta[0] + beta[1] * x[1] + beta[2] * x[2];
    ssRes += (ys[i]! - fitted) ** 2;
    ssTot += (ys[i]! - yMean) ** 2;
    return ys[i]! - fitted;
  });
  return { beta, r2: 1 - ssRes / ssTot, residuals };
}

// R2 of a given line on a given set of protocols (the line need not be theirs).
function rSquared(beta: [number, number, number], rows: SnapshotProtocol[]): number {
  const ys = rows.map((p) => log10(p.mcap_usd!));
  const yMean = ys.reduce((a, y) => a + y, 0) / ys.length;
  let ssRes = 0;
  let ssTot = 0;
  rows.forEach((p, i) => {
    const x = designRow(p);
    const fitted = beta[0] + beta[1] * x[1] + beta[2] * x[2];
    ssRes += (ys[i]! - fitted) ** 2;
    ssTot += (ys[i]! - yMean) ** 2;
  });
  return 1 - ssRes / ssTot;
}

// ---- peer selection and the trimmed fit --------------------------------------
interface PeerSet {
  peers: SnapshotProtocol[];
  dust: number;
  chainCex: number;
}

/** The peers the line is fitted on: tokened, positive cap and TVL, a cap/TVL
 *  ratio at or above the dust line, and not a chain or an exchange. */
function selectPeers(snapshot: Snapshot): PeerSet {
  const peers: SnapshotProtocol[] = [];
  let dust = 0;
  let chainCex = 0;
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (p.mcap_usd / p.tvl_usd < DUST_RATIO) { dust++; continue; }
    if (PEER_CATEGORIES_OUT.has(p.category ?? '')) { chainCex++; continue; }
    peers.push(p);
  }
  return { peers, dust, chainCex };
}

interface TrimmedFit {
  beta: [number, number, number];
  r2All: number;
  r2Kept: number;
  trimmed: SnapshotProtocol[];
  keptCount: number;
}

/** Fit, drop the worst-fitting decile by absolute residual, refit on the
 *  rest. The first fit's line never survives: the refit is the model. */
function trimmedFit(rows: SnapshotProtocol[]): TrimmedFit {
  const first = leastSquares(rows);
  const byError = rows
    .map((p, i) => ({ p, error: Math.abs(first.residuals[i]!) }))
    .sort((a, b) => b.error - a.error);
  const nTrim = Math.floor(rows.length * TRIM_FRACTION);
  const trimmedSet = new Set(byError.slice(0, nTrim).map((o) => o.p));
  const kept = rows.filter((p) => !trimmedSet.has(p));
  const refit = leastSquares(kept);
  return {
    beta: refit.beta,
    r2All: rSquared(refit.beta, rows),
    r2Kept: refit.r2,
    trimmed: byError.slice(0, nTrim).map((o) => o.p),
    keptCount: kept.length,
  };
}

// ---- prediction ---------------------------------------------------------------
interface Adjustments {
  growthMultiplier: number;
  maturityMultiplier: number;
  growthPct: number;
}

/** The two bounded adjustments, from a protocol's own record. Growth is the
 *  7-day TVL change clipped to [-60, +120]; a missing change counts as 0.
 *  Maturity grows from 0.9 toward 1.1 over three years; an unknown listing
 *  date counts as one year old. */
function adjustments(p: SnapshotProtocol, asOf: Date): Adjustments {
  const growthPct = clamp(p.change_7d ?? 0, GROWTH_FLOOR, GROWTH_CAP);
  const age = ageInDays(p, asOf) ?? UNKNOWN_AGE_DAYS;
  return {
    growthMultiplier: 1 + GROWTH_WEIGHT * (growthPct / 100),
    maturityMultiplier: MATURITY_FLOOR + MATURITY_RANGE * (Math.min(age, MATURITY_DAYS) / MATURITY_DAYS),
    growthPct,
  };
}

function fittedLog(p: SnapshotProtocol, beta: [number, number, number]): number {
  const x = designRow(p);
  return beta[0] + beta[1] * x[1] + beta[2] * x[2];
}

/** A protocol's implied token value under a line: the fitted log value,
 *  raised back to dollars and pushed by the two adjustments. */
function predictedUsd(p: SnapshotProtocol, beta: [number, number, number], asOf: Date): number {
  const adj = adjustments(p, asOf);
  return 10 ** fittedLog(p, beta) * adj.growthMultiplier * adj.maturityMultiplier;
}

// ---- held-out validation -------------------------------------------------------
interface WalkForward {
  cutoff: string;
  train: number;
  test: number;
  medianMultiple: number;
  within2x: number;
}

/** Leave-one-out: each peer is held out in turn and the line (trim included)
 *  is refitted without it. Walk-forward: the line is fitted on the peers
 *  listed before a cutoff date and tested on the ones listed from it. The
 *  cutoff is the listed date at the split's index, so every protocol listed
 *  on that date lands in the test set. */
function validateModel(peers: SnapshotProtocol[], asOf: Date): {
  looMedian: number;
  looWithin2x: number;
  looErrors: number[];
  walk70: WalkForward;
  walk60: WalkForward;
} {
  const looErrors = peers.map((held, i) => {
    const rest = peers.filter((_, j) => j !== i);
    return errorMultiple(predictedUsd(held, trimmedFit(rest).beta, asOf), held.mcap_usd!);
  });
  const dated = peers
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  const walk = (fraction: number): WalkForward => {
    const nTrain = Math.floor(fraction * dated.length);
    const cutoff = dated[nTrain]!.listed_at!;
    const train = dated.filter((p) => p.listed_at! < cutoff);
    const test = dated.filter((p) => p.listed_at! >= cutoff);
    const fit = trimmedFit(train);
    const errs = test.map((p) => errorMultiple(predictedUsd(p, fit.beta, asOf), p.mcap_usd!));
    return {
      cutoff,
      train: train.length,
      test: test.length,
      medianMultiple: medianOf(errs),
      within2x: errs.filter((e) => e <= 2).length / errs.length,
    };
  };
  return {
    looMedian: medianOf(looErrors),
    looWithin2x: looErrors.filter((e) => e <= 2).length / looErrors.length,
    looErrors,
    walk70: walk(0.7),
    walk60: walk(0.6),
  };
}

// ---- classification -------------------------------------------------------------
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const BRIDGE_STAKING_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Why a protocol with no token is excluded from launching one of its own.
 *  Returns null when nothing excludes it. Checked in this order, so a name
 *  that matches twice takes the first reason: an exchange first, then a
 *  version marker, then a wrapped/staked word, then its category. */
function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category === 'CEX') return 'a centralised exchange';
  if (EXCHANGE_NAMES.some((x) => p.name === x || p.name.startsWith(`${x} `))) return 'an exchange product';
  if (/\sV\d+$/.test(p.name)) return 'a versioned pool of another protocol';
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return 'a wrapped or staked product of a token that trades';
  if (BRIDGE_STAKING_CATEGORIES.has(p.category ?? '')) return 'a bridge or staking product of a token that trades';
  return null;
}

/** Live means the record carries a token (a Gecko id or a symbol). Without
 *  one, a protocol is excluded when the rule above fires, and otherwise it
 *  is a launch candidate. */
function classify(p: SnapshotProtocol): { status: TokenStatus; reason: string | null } {
  if (p.gecko_id !== null || p.symbol !== null) return { status: 'live', reason: null };
  const reason = exclusionReason(p);
  if (reason !== null) return { status: 'excluded', reason };
  return { status: 'pre-token', reason: null };
}

// ---- launch odds ----------------------------------------------------------------
// Odds are a binned empirical share: TVL tercile crossed with age tercile,
// the share of live protocols in the cell, smoothed toward the global live
// share with a strength of 2. Tercile cuts are the sorted values at a third
// and two thirds of the board; a protocol with no listing date counts as a
// year old for the binning, the same default the maturity adjustment uses.
function tercileCuts(values: number[]): [number, number] {
  const sorted = [...values].sort((a, b) => a - b);
  return [sorted[Math.floor(sorted.length / 3)]!, sorted[Math.floor((2 * sorted.length) / 3)]!];
}

function launchOddsTable(snapshot: Snapshot, statuses: Map<string, TokenStatus>): Map<string, number> {
  const asOf = new Date(`${snapshot.as_of}T00:00:00Z`);
  const tvlCuts = tercileCuts(snapshot.protocols.map((p) => p.tvl_usd));
  const ageCuts = tercileCuts(snapshot.protocols.map((p) => ageInDays(p, asOf) ?? UNKNOWN_AGE_DAYS));
  const bin = (p: SnapshotProtocol): string => {
    const tvlBin = p.tvl_usd < tvlCuts[0] ? 0 : p.tvl_usd < tvlCuts[1] ? 1 : 2;
    const age = ageInDays(p, asOf) ?? UNKNOWN_AGE_DAYS;
    const ageBin = age < ageCuts[0] ? 0 : age < ageCuts[1] ? 1 : 2;
    return `${tvlBin},${ageBin}`;
  };
  const cells = new Map<string, { n: number; live: number }>();
  let liveTotal = 0;
  for (const p of snapshot.protocols) {
    const key = bin(p);
    const cell = cells.get(key) ?? { n: 0, live: 0 };
    cell.n++;
    if (statuses.get(p.slug) === 'live') { cell.live++; liveTotal++; }
    cells.set(key, cell);
  }
  const globalLive = liveTotal / snapshot.protocols.length;
  const odds = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const cell = cells.get(bin(p))!;
    odds.set(p.slug, roundTo((cell.live + 2 * globalLive) / (cell.n + 2), 3));
  }
  return odds;
}

// ---- farm plans -------------------------------------------------------------------
// Gas is what a first transaction costs on the protocol's first chain, in
// whole dollars as written: most chains $2, Ethereum $12, the optimistic
// rollups $1.50, Avalanche $1, Polygon $0.20, Solana $0.05.
const GAS_USD: Record<string, string> = {
  Ethereum: '12',
  Arbitrum: '1.5',
  Base: '1.5',
  Optimism: '1.5',
  Avalanche: '1',
  Polygon: '0.20',
  Solana: '0.05',
};
const gasUsd = (p: SnapshotProtocol): string => GAS_USD[p.chains[0]!] ?? '2';

// The deposit scales with size: $50 under $100M TVL, $100 under $1B, $150
// under $5B, $250 above.
function depositUsd(p: SnapshotProtocol): number {
  if (p.tvl_usd < 100_000_000) return 50;
  if (p.tvl_usd < 1_000_000_000) return 100;
  if (p.tvl_usd < 5_000_000_000) return 150;
  return 250;
}

// Steps two and three depend on what the protocol is. Categories not listed
// here take the plain deposit.
const PLAN_KIND_BY_CATEGORY: Record<string, string> = {
  Dexs: 'liquidity', Indexes: 'liquidity', 'Leveraged Farming': 'liquidity', Yield: 'liquidity', 'Yield Aggregator': 'liquidity',
  CDP: 'lender', 'CDP Manager': 'lender', 'Collateral Management': 'lender', 'Collateral Markets': 'lender', Lending: 'lender', 'Uncollateralized Lending': 'lender',
  'Onchain Capital Allocator': 'vaults', 'Risk Curators': 'vaults',
  'Liquid Restaking': 'stake', 'Liquid Staking': 'stake', 'Restaked BTC': 'stake', Restaking: 'stake', 'Staking Pool': 'stake',
  Bridge: 'bridge', 'Canonical Bridge': 'bridge', 'Cross Chain Bridge': 'bridge',
  RWA: 'mint-yield',
  Derivatives: 'margin', 'Interest Rate Derivatives': 'margin',
  'Algo-Stables': 'stable', 'Dual-Token Stablecoin': 'stable', 'Stablecoin Issuer': 'stable', 'Stablecoin Wrapper': 'stable',
  'Prediction Market': 'predict',
  Insurance: 'insurance',
};
const planKind = (p: SnapshotProtocol): string => PLAN_KIND_BY_CATEGORY[p.category ?? ''] ?? 'deposit';

const SECOND_STEP: Record<string, (p: SnapshotProtocol, dep: number, gas: string) => string> = {
  liquidity: (p, dep, gas) => `Add $${dep} of liquidity to ${p.name}'s main pool on ${p.chains[0]} and leave the position in place. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
  lender: (p, dep, gas) => `Put $${dep} of USDC to work as a lender on ${p.name} (${p.chains[0]}) and leave the supply in place. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
  deposit: (p, dep, gas) => `Deposit $${dep} of USDC into ${p.name} on ${p.chains[0]} and keep the position open. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
  stake: (p, dep, gas) => `Stake $${dep} of the chain's staking asset through ${p.name} and hold on to the receipt token. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
  vaults: (p, dep, gas) => `Deposit $${dep} into one of ${p.name}'s vaults on ${p.chains[0]} and hold the vault shares. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
  bridge: (p, dep, gas) => `Move $${dep} of USDC to ${p.chains[0]} through ${p.name}, then use the bridged funds inside its app. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
  'mint-yield': (p, dep, gas) => `Mint $${dep} of ${p.name}'s yield-bearing asset on ${p.chains[0]} and hold it. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
  stable: (p, dep, gas) => `Mint or deposit $${dep} of the stable asset through ${p.name} on ${p.chains[0]}. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
  margin: (p, dep, gas) => `Post $${dep} of USDC as margin on ${p.name} and open one small hedged position. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
  predict: (p, dep, gas) => `Fund ${p.name} with $${dep} and take one position on a market that settles later. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
  insurance: (p, dep, gas) => `Buy $${dep} of cover from ${p.name} on ${p.chains[0]} and keep the policy active. Cost: $${dep} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
};

const THIRD_STEP: Record<string, (p: SnapshotProtocol, gas: string) => string> = {
  liquidity: (p, gas) => `Stake the liquidity receipt in ${p.name}'s gauge or farm, so the same capital earns points on top of trading fees. Cost: about $${gas} of gas. Time: 15 minutes.`,
  lender: (p, gas) => `Borrow up to 40% of the supplied value against the position, then swap what you borrowed back into the supplied asset. Cost: about $${gas} of gas. Time: 15 minutes.`,
  deposit: (p, gas) => `Repeat the deposit with a second tranche, from a different wallet, on ${p.chains[0]}. Cost: about $${gas} of gas. Time: 15 minutes.`,
  stake: (p, gas) => `Restake the receipt token in ${p.name}'s restaking vault and keep the second receipt. Cost: about $${gas} of gas. Time: 15 minutes.`,
  vaults: (p, gas) => `Place a second deposit in a different vault run by the same protocol. Cost: about $${gas} of gas. Time: 15 minutes.`,
  bridge: (p, gas) => `Send half the bridged funds back along the same route, so the wallet shows activity in both directions. Cost: about $${gas} of gas. Time: 15 minutes.`,
  'mint-yield': (p, gas) => `Post the yield asset as collateral in a lending market on ${p.chains[0]}. Cost: about $${gas} of gas. Time: 15 minutes.`,
  stable: (p, gas) => `Supply the stable asset as liquidity in ${p.name}'s own pool on ${p.chains[0]}. Cost: about $${gas} of gas. Time: 15 minutes.`,
  margin: (p, gas) => `Close the hedge after one funding cycle, then reopen it on the opposite side. Cost: about $${gas} of gas. Time: 15 minutes.`,
  predict: (p, gas) => `Let the first position settle, then take a second one on a market that closes after it. Cost: about $${gas} of gas. Time: 15 minutes.`,
  insurance: (p, gas) => `Stake the cover receipt in ${p.name}'s staking pool. Cost: about $${gas} of gas. Time: 15 minutes.`,
};

// The hold is 30 days, or 45 for a protocol under a year old, 60 for one
// under six months — younger protocols need longer to show up in more than
// one snapshot. A protocol with no listing date holds 30.
function holdDays(p: SnapshotProtocol, asOf: Date): number {
  const age = ageInDays(p, asOf);
  if (age === null || age >= 365) return 30;
  if (age >= 180) return 45;
  return 60;
}

/** Seven costed steps: a fresh wallet, the protocol's own kind of position,
 *  a second touch, a weekly action, a hold, a warning to claim only from
 *  the protocol's own links, and what to do at the exit (or at a launch). */
function farmPlan(p: SnapshotProtocol, status: TokenStatus, asOf: Date): string[] {
  const gas = gasUsd(p);
  const dep = depositUsd(p);
  const kind = planKind(p);
  const hold = holdDays(p, asOf);
  const candidate = status === 'pre-token';
  return [
    `Set aside a fresh wallet holding only the funds you plan to ${candidate ? 'farm' : 'use'}, and keep its seed phrase offline. Cost: about $${gas} of gas for the first transaction on ${p.chains[0]}. Time: 5 minutes.`,
    SECOND_STEP[kind]!(p, dep, gas),
    THIRD_STEP[kind]!(p, gas),
    `Do one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $${gas} of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days ${candidate ? 'so the activity shows up in more than one snapshot' : 'to earn a full rewards cycle before you judge it'}. Cost: the $${dep} stays in the position. Time: ${hold} days.`,
    `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    candidate
      ? `If a token launches, claim only from the protocol's own announcement, sell at most half in the first week, and keep the rest staked. Cost: about $${gas} of gas to claim and swap. Time: 30 minutes at launch.`
      : `When you exit, unwind in the reverse order, keep every receipt, and write down the gain or loss for your own records. Cost: about $${gas} of gas to unwind. Time: 30 minutes to exit.`,
  ];
}

// ---- the board --------------------------------------------------------------------
/** Fit the model, validate it, score every protocol and rank the board.
 *  Returns the board (ranked, ranks 1..N) and the radar object the
 *  dashboard's data.js is built from. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const asOf = new Date(`${snapshot.as_of}T00:00:00Z`);
  const peerSet = selectPeers(snapshot);
  const fit = trimmedFit(peerSet.peers);
  const validation = validateModel(peerSet.peers, asOf);

  // The published coefficients, four decimals each: the board is scored
  // with these, so the line in MODEL.md and the line in the board agree.
  const published: [number, number, number] = [
    roundTo(fit.beta[0], 4),
    roundTo(fit.beta[1], 4),
    roundTo(fit.beta[2], 4),
  ];
  const conformal = roundTo(
    [...validation.looErrors].sort((a, b) => a - b)[Math.ceil(0.8 * validation.looErrors.length) - 1]!,
    3,
  );

  const statuses = new Map<string, TokenStatus>();
  const reasons = new Map<string, string | null>();
  for (const p of snapshot.protocols) {
    const c = classify(p);
    statuses.set(p.slug, c.status);
    reasons.set(p.slug, c.reason);
  }
  const odds = launchOddsTable(snapshot, statuses);

  const rows: BoardRow[] = snapshot.protocols.map((p) => {
    const status = statuses.get(p.slug)!;
    const age = ageInDays(p, asOf);
    const adj = adjustments(p, asOf);
    const fitted = fittedLog(p, published);
    const raw = Math.round(10 ** fitted * adj.growthMultiplier * adj.maturityMultiplier);
    const low = Math.round(raw / conformal);
    const high = Math.round(raw * conformal);
    const excluded = status === 'excluded';
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: status,
      exclusion_reason: excluded ? reasons.get(p.slug)! : null,
      watchlist: snapshot.watchlist.includes(p.slug),
      age_days: age,
      implied_value_usd: excluded ? 1 : raw,
      launch_odds: odds.get(p.slug)!,
      interval_low_usd: excluded ? 1 : low,
      interval_high_usd: excluded ? 1 : high,
      model: {
        fitted_log_value: roundTo(fitted, 4),
        growth_pct: roundTo(adj.growthPct, 2),
        growth_multiplier: roundTo(adj.growthMultiplier, 4),
        maturity_multiplier: roundTo(adj.maturityMultiplier, 4),
        raw_prediction_usd: raw,
        interval_low_usd: low,
        interval_high_usd: high,
        age_days: age,
      },
      farm_steps: farmPlan(p, status, asOf),
    };
  });
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => { r.rank = i + 1; });

  const radar: Radar = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: {
      version: 'radar-4',
      peers: peerSet.peers.length,
      peers_kept: fit.keptCount,
      peers_trimmed: fit.trimmed.length,
      peers_excluded_dust: peerSet.dust,
      peers_excluded_chain_cex: peerSet.chainCex,
      trimmed_slugs: fit.trimmed.map((p) => p.slug).sort(),
      intercept: published[0],
      log_tvl: published[1],
      log_chains: published[2],
      growth_weight: GROWTH_WEIGHT,
      growth_floor: GROWTH_FLOOR,
      growth_cap: GROWTH_CAP,
      maturity_floor: MATURITY_FLOOR,
      maturity_range: MATURITY_RANGE,
      maturity_days: MATURITY_DAYS,
      unknown_age_days: UNKNOWN_AGE_DAYS,
      trim_fraction: TRIM_FRACTION,
      r2: roundTo(fit.r2All, 3),
      r2_kept: roundTo(fit.r2Kept, 3),
    },
    validation: {
      loo_median_multiple: roundTo(validation.looMedian, 3),
      loo_within_2x: roundTo(validation.looWithin2x, 3),
      loo_n: peerSet.peers.length,
      walk_forward_70_cutoff: validation.walk70.cutoff,
      walk_forward_70_train: validation.walk70.train,
      walk_forward_70_test: validation.walk70.test,
      walk_forward_70_median_multiple: roundTo(validation.walk70.medianMultiple, 3),
      walk_forward_70_within_2x: roundTo(validation.walk70.within2x, 3),
      walk_forward_60_cutoff: validation.walk60.cutoff,
      walk_forward_60_train: validation.walk60.train,
      walk_forward_60_test: validation.walk60.test,
      walk_forward_60_median_multiple: roundTo(validation.walk60.medianMultiple, 3),
      walk_forward_60_within_2x: roundTo(validation.walk60.within2x, 3),
      conformal_80_factor: conformal,
    },
    rows,
    watchlist_size: snapshot.watchlist.length,
    pre_token_size: rows.filter((r) => r.token_status === 'pre-token').length,
    live_size: rows.filter((r) => r.token_status === 'live').length,
    excluded_size: rows.filter((r) => r.token_status === 'excluded').length,
  };
  return { board: rows, radar };
}

// ---- the dashboard dataset ---------------------------------------------------------
/** The dashboard's data.js: the board flattened for the page (the model's
 *  detail folded into each row, the row-level intervals kept as ranked),
 *  plus the 24 largest live tokens by market cap for the fitted-vs-market
 *  comparison. */
export function dataScript(radar: Radar): string {
  const rows = radar.rows.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    mcap_usd: r.mcap_usd,
    listed_at: r.listed_at,
    age_days: r.age_days,
    implied_value_usd: r.implied_value_usd,
    launch_odds: r.launch_odds,
    token_status: r.token_status,
    exclusion_reason: r.exclusion_reason,
    watchlist: r.watchlist,
    fitted_log_value: r.model.fitted_log_value,
    growth_multiplier: r.model.growth_multiplier,
    maturity_multiplier: r.model.maturity_multiplier,
    raw_prediction_usd: r.model.raw_prediction_usd,
    interval_low_usd: r.interval_low_usd,
    interval_high_usd: r.interval_high_usd,
    farm_steps: r.farm_steps,
  }));
  const live = [...radar.rows]
    .filter((r) => r.token_status === 'live')
    .sort((a, b) => (b.mcap_usd ?? -1) - (a.mcap_usd ?? -1))
    .slice(0, 24)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      mcap_usd: r.mcap_usd,
      change_7d: r.change_7d,
      implied_value_usd: r.implied_value_usd,
    }));
  return `window.RADAR=${JSON.stringify({
    as_of: radar.as_of,
    source: radar.source,
    floor_usd: radar.floor_usd,
    model: radar.model,
    validation: radar.validation,
    model_version: radar.model.version,
    watchlist_size: radar.watchlist_size,
    board_size: radar.rows.length,
    pre_token_size: radar.pre_token_size,
    live_size: radar.live_size,
    excluded_size: radar.excluded_size,
    rows,
    live,
  })};\n`;
}

// ---- the gate's shape, checked before anything is written ---------------------------
/** The board the gate refuses, in one line, or null when the board is
 *  shaped the way the gate requires. Mirrors the scorer's board checks. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows: the gate wants 100 to 4000`;
  const snapSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let previous = Infinity;
  let first = 0;
  let last = 0;
  for (const [i, r] of board.entries()) {
    if (!snapSlugs.has(r.slug)) return `row ${r.slug} is not one of the snapshot's protocols`;
    if (seen.has(r.slug)) return `row ${r.slug} appears twice`;
    seen.add(r.slug);
    if (r.rank !== i + 1) return `ranks are not exactly 1..${board.length}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) {
      return `row ${r.slug} has an implied value that is not a positive whole number of dollars`;
    }
    if (r.implied_value_usd > previous) return `implied value rises from rank ${i} to rank ${i + 1}`;
    previous = r.implied_value_usd;
    if (i === 0) first = r.implied_value_usd;
    last = r.implied_value_usd;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${r.slug} holds ${r.farm_steps.length} farm steps: the gate wants 3 to 12`;
    for (const s of r.farm_steps) {
      if (s.trim().length < 20 || s.trim().length > 600) return `row ${r.slug} has a farm step outside 20 to 600 characters`;
    }
  }
  if (board.length >= 2 && first === last) return 'every implied value is the same: a board that ranks nothing by value is not a ranking';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  return null;
}
