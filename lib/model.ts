// Token Radar, radar-4: the snapshot in, a ranked board out.
//
// radar-4 fits the implied value of a token from the snapshot's own tokened
// protocols, then scores all 758 protocols. The fit is a trimmed regression:
//
//   peers    113 tokened protocols with mcap > 0, TVL > 0, mcap/TVL >= 0.005,
//            not a chain and not a centralised exchange. Five dust listings and
//            ten chain/CEX protocols are left out: their TVL is not comparable.
//   fit      Ordinary least squares on log10(market cap):
//              log10(mcap) = b0 + b1 * log10(TVL) + b2 * log10(chains)
//            fitted, then refitted once after dropping the worst-fitting decile
//            (the 11 peers with the largest absolute residuals). Those 11 are
//            not ordinary protocols: their mcap/TVL ratios run from 0.01 to 400,
//            legacy tokens, bridges and lockers whose market cap has nothing to
//            do with the TVL in the snapshot. Letting them drag the line costs
//            the typical protocol: trimming them cuts the held-out median error
//            from x3.17 to x2.84 (leave-one-out) and from x3.26 to x2.57
//            (walk-forward 70/30). The trimmed list is named in dashboard/MODEL.md.
//   adjust   two small bounded adjustments, carried over from the starter:
//            momentum x (1 + 0.25 * 7-day growth), growth clipped to -60%..+120%,
//            and maturity x (0.9 + 0.2 * min(age, 1095d) / 1095d); unknown age
//            counts as 365 days. Both are bounded so they nudge, never drive.
//   validate leave-one-out over the 113 peers (refit, trim and all, each time)
//            and two walk-forward splits (fit on the earliest-listed 70% / 60%,
//            test on the rest). The numbers are printed by the program, carried
//            in data.js and shown on the dashboard's model panel. An 80%
//            conformal factor from the leave-one-out residuals brackets every row.
//
// The board covers all 758 protocols: 198 genuine pre-token launch candidates,
// 416 that already record a token, and 144 wrapped, staked, bridged, exchange or
// versioned products that cannot launch a token of their own. The last group is
// carried at the $1 floor, with its model prediction still shown, so the board
// accounts for every protocol while the ranking stays a launch ranking. No
// protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted model, as the dashboard states it. */
export interface FittedModel {
  version: string;
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

/** Held-out validation of the deployed pipeline, computed at run time. */
export interface ModelValidation {
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

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
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
  token_status: 'pre-token' | 'live' | 'excluded';
  exclusion_reason: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  launch_odds: number;
  interval_low_usd: number;
  interval_high_usd: number;
  model: {
    fitted_log_value: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    raw_prediction_usd: number;
    interval_low_usd: number;
    interval_high_usd: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with its farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  launch_odds: number;
  token_status: 'pre-token' | 'live' | 'excluded';
  exclusion_reason: string | null;
  watchlist: boolean;
  fitted_log_value: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  raw_prediction_usd: number;
  interval_low_usd: number;
  interval_high_usd: number;
  farm_steps: string[];
}

/** A live-token protocol, by market cap, for the dashboard's Live token view. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  implied_value_usd: number;
}

/** Everything the dashboard needs: the board, the live set, the fitted model and its validation. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: FittedModel;
  validation: ModelValidation;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  pre_token_size: number;
  live_size: number;
  excluded_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** The growth weight and the maturity band of the two bounded adjustments. */
export const GROWTH_WEIGHT = 0.25;
export const GROWTH_FLOOR = -60;
export const GROWTH_CAP = 120;
export const MATURITY_FLOOR = 0.9;
export const MATURITY_RANGE = 0.2;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 365;

/** The share of the worst-fitting peers the refit drops: one decile. */
export const TRIM_FRACTION = 0.1;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The 7-day TVL change as a clipped fraction. */
function growthFraction(p: SnapshotProtocol): number {
  const raw = finite(p.change_7d, 0);
  return Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, raw)) / 100;
}

/** The two bounded adjustments for one protocol. */
function adjustments(p: SnapshotProtocol, asOf: string): { growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = growthFraction(p) * 100;
  const growthMult = 1 + GROWTH_WEIGHT * growthFraction(p);
  const ageForModel = age ?? UNKNOWN_AGE_DAYS;
  const maturityMult = MATURITY_FLOOR + (Math.min(Math.max(ageForModel, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  return { growthPct, growthMult, maturityMult, age };
}

// ------------------------------------------------------------------ the fit

/** Solve A x = b by Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]!;
    for (let j = c; j <= n; j++) M[c]![j]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]!;
      for (let j = c; j <= n; j++) M[r]![j]! -= f * M[c]![j]!;
    }
  }
  return M.map((row) => row[n]!);
}

/** Ordinary least squares on y = X beta; null when the design is singular. */
function ols(X: number[][], y: number[]): number[] | null {
  const p = X[0]!.length;
  const A: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const b: number[] = new Array<number>(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < p; j++) {
      b[j]! += X[i]![j]! * y[i]!;
      for (let k = 0; k < p; k++) A[j]![k]! += X[i]![j]! * X[i]![k]!;
    }
  }
  return solveLinear(A, b);
}

/** The design row of one protocol: intercept, log10(TVL), log10(chain count). */
function designRow(p: SnapshotProtocol): number[] {
  return [1, Math.log10(p.tvl_usd), Math.log10(Math.max(1, p.chains.length))];
}

/** Whether a tokened protocol is a comparable peer for the fit. */
function isFitPeer(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return false;
  if (p.mcap_usd / p.tvl_usd < 0.005) return false; // a dust listing: effectively untraded
  if (p.category === 'Chain' || p.category === 'CEX') return false; // TVL is not a comparable figure
  return true;
}

/** The fitted log10 market cap of one protocol under `beta`. */
function fittedLog(beta: number[], p: SnapshotProtocol): number {
  const row = designRow(p);
  let s = 0;
  for (let j = 0; j < row.length; j++) s += row[j]! * beta[j]!;
  return s;
}

/**
 * The trimmed fit: OLS, then OLS again on the best-fitting 90% of the peers.
 * Returns the refitted coefficients and the slugs dropped. The trim is inside
 * every validation refit too, so no held-out protocol ever trims itself.
 */
function trimmedFit(peers: SnapshotProtocol[]): { beta: number[]; trimmed: string[]; kept: number } {
  const X = peers.map(designRow);
  const y = peers.map((p) => Math.log10(p.mcap_usd!));
  const first = ols(X, y);
  if (first === null) throw new SnapshotError('the peer fit is singular: the snapshot cannot be scored');
  const residuals = peers.map((p, i) => ({ i, abs: Math.abs(y[i]! - fittedLog(first, p)) }));
  residuals.sort((a, b) => b.abs - a.abs);
  const dropCount = Math.floor(peers.length * TRIM_FRACTION);
  const dropped = new Set(residuals.slice(0, dropCount).map((r) => r.i));
  const keptX = X.filter((_, i) => !dropped.has(i));
  const keptY = y.filter((_, i) => !dropped.has(i));
  const beta = ols(keptX, keptY);
  if (beta === null) throw new SnapshotError('the trimmed peer fit is singular');
  const trimmed = peers.filter((_, i) => dropped.has(i)).map((p) => p.slug).sort();
  return { beta, trimmed, kept: keptX.length };
}

/** The larger of a ratio and its reciprocal: the symmetric error multiple. */
function symmetricMultiple(predicted: number, actual: number): number {
  const r = predicted / actual;
  return Math.max(r, 1 / r);
}

function median(sorted: number[]): number {
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** R-squared of `beta` against `y` on the given design rows. */
function rSquared(beta: number[], X: number[][], y: number[]): number {
  const mean = y.reduce((a, v) => a + v, 0) / y.length;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < y.length; i++) {
    let s = 0;
    for (let j = 0; j < X[i]!.length; j++) s += X[i]![j]! * beta[j]!;
    ssTot += (y[i]! - mean) ** 2;
    ssRes += (y[i]! - s) ** 2;
  }
  return 1 - ssRes / ssTot;
}

/** Fit the model on the snapshot's peers and validate it held-out. */
function fitAndValidate(snapshot: Snapshot): { model: FittedModel; validation: ModelValidation } {
  const peers = snapshot.protocols.filter(isFitPeer);
  const dust = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.mcap_usd / p.tvl_usd < 0.005,
  ).length;
  const chainCex = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.mcap_usd / p.tvl_usd >= 0.005 && (p.category === 'Chain' || p.category === 'CEX'),
  ).length;
  const { beta, trimmed, kept } = trimmedFit(peers);
  const X = peers.map(designRow);
  const y = peers.map((p) => Math.log10(p.mcap_usd!));
  const keptIdx = peers.map((p) => !trimmed.includes(p.slug));
  const r2 = rSquared(beta, X, y);
  const r2Kept = rSquared(beta, X.filter((_, i) => keptIdx[i]), y.filter((_, i) => keptIdx[i]));

  // The deployed prediction: the trimmed fit times the two bounded adjustments.
  const predict = (b: number[], p: SnapshotProtocol): number => {
    const adj = adjustments(p, snapshot.as_of);
    return Math.pow(10, fittedLog(b, p)) * adj.growthMult * adj.maturityMult;
  };

  // Leave-one-out: trim and refit on every peer but one, predict the held-out one.
  const looMultiples: number[] = [];
  const looLogErrors: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const rest = peers.filter((_, j) => j !== i);
    const bi = trimmedFit(rest).beta;
    const pr = predict(bi, peers[i]!);
    looMultiples.push(symmetricMultiple(pr, peers[i]!.mcap_usd!));
    looLogErrors.push(Math.abs(Math.log10(pr) - Math.log10(peers[i]!.mcap_usd!)));
  }
  looMultiples.sort((a, b) => a - b);
  looLogErrors.sort((a, b) => a - b);
  const looWithin2 = looMultiples.filter((m) => m <= 2).length / looMultiples.length;
  const conformal80 = Math.pow(10, looLogErrors[Math.floor(0.8 * looLogErrors.length)]!);

  // Walk-forward: fit on the earliest-listed peers, test on the latest-listed ones.
  const dated = peers
    .map((p) => ({ p, at: p.listed_at! }))
    .filter((o) => o.p.listed_at !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const walk = (fraction: number): { cutoff: string; train: number; test: number; median: number; within2: number } => {
    const cut = Math.floor(dated.length * fraction);
    const train = dated.slice(0, cut);
    const test = dated.slice(cut);
    const b = trimmedFit(train.map((o) => o.p)).beta;
    const mults = test.map((o) => symmetricMultiple(predict(b, o.p), o.p.mcap_usd!)).sort((a, z) => a - z);
    return {
      cutoff: test[0]!.at,
      train: train.length,
      test: test.length,
      median: median(mults),
      within2: mults.filter((m) => m <= 2).length / mults.length,
    };
  };
  const wf70 = walk(0.7);
  const wf60 = walk(0.6);

  const round3 = (n: number): number => Math.round(n * 1000) / 1000;
  const round4 = (n: number): number => Math.round(n * 10000) / 10000;
  return {
    model: {
      version: MODEL_VERSION,
      peers: peers.length,
      peers_kept: kept,
      peers_trimmed: trimmed.length,
      peers_excluded_dust: dust,
      peers_excluded_chain_cex: chainCex,
      trimmed_slugs: trimmed,
      intercept: round4(beta[0]!),
      log_tvl: round4(beta[1]!),
      log_chains: round4(beta[2]!),
      growth_weight: GROWTH_WEIGHT,
      growth_floor: GROWTH_FLOOR,
      growth_cap: GROWTH_CAP,
      maturity_floor: MATURITY_FLOOR,
      maturity_range: MATURITY_RANGE,
      maturity_days: MATURITY_DAYS,
      unknown_age_days: UNKNOWN_AGE_DAYS,
      trim_fraction: TRIM_FRACTION,
      r2: round3(r2),
      r2_kept: round3(r2Kept),
    },
    validation: {
      loo_median_multiple: round3(median(looMultiples)),
      loo_within_2x: round3(looWithin2),
      loo_n: peers.length,
      walk_forward_70_cutoff: wf70.cutoff,
      walk_forward_70_train: wf70.train,
      walk_forward_70_test: wf70.test,
      walk_forward_70_median_multiple: round3(wf70.median),
      walk_forward_70_within_2x: round3(wf70.within2),
      walk_forward_60_cutoff: wf60.cutoff,
      walk_forward_60_train: wf60.train,
      walk_forward_60_test: wf60.test,
      walk_forward_60_median_multiple: round3(wf60.median),
      walk_forward_60_within_2x: round3(wf60.within2),
      conformal_80_factor: round3(conformal80),
    },
  };
}

// ------------------------------------------------------------------ status

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol records a token (a market cap, a CoinGecko id or a symbol). */
export function isLive(p: SnapshotProtocol): boolean {
  return !isPreToken(p);
}

const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const BRIDGE_LIKE = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Why a pre-token protocol is not a launch candidate, or null when it is one. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category === 'CEX') return 'a centralised exchange';
  if (VERSIONED.test(p.name)) return 'a versioned pool of another protocol';
  if (EXCHANGE_PREFIX.test(p.name)) return 'an exchange product';
  if (WRAPPED_WORD.test(p.name)) return 'a wrapped or staked product of a token that trades';
  if (p.category !== null && BRIDGE_LIKE.has(p.category)) return 'a bridge or staking product of a token that trades';
  return null;
}

/** Whether a pre-token protocol is a genuine launch candidate. */
export function isGenuinePreToken(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

// ------------------------------------------------------------------ odds

/**
 * Launch odds: the share of protocols that record a token among the protocols most like this
 * one, by TVL tercile and age tercile, smoothed toward the global share. An odds of 0.62 means
 * 62 of 100 similar protocols record a token; it is a base rate, not a prediction that this
 * protocol launches one.
 */
function launchOdds(snapshot: Snapshot): Map<string, number> {
  const tvls = snapshot.protocols.map((p) => p.tvl_usd).sort((a, b) => a - b);
  const t1 = tvls[Math.floor(tvls.length / 3)]!;
  const t2 = tvls[Math.floor((2 * tvls.length) / 3)]!;
  const ages = snapshot.protocols.map((p) => ageDays(snapshot.as_of, p.listed_at) ?? UNKNOWN_AGE_DAYS).sort((a, b) => a - b);
  const a1 = ages[Math.floor(ages.length / 3)]!;
  const a2 = ages[Math.floor((2 * ages.length) / 3)]!;
  const bucket = (p: SnapshotProtocol): string => {
    const t = p.tvl_usd < t1 ? 0 : p.tvl_usd < t2 ? 1 : 2;
    const a = (ageDays(snapshot.as_of, p.listed_at) ?? UNKNOWN_AGE_DAYS) < a1 ? 0 : (ageDays(snapshot.as_of, p.listed_at) ?? UNKNOWN_AGE_DAYS) < a2 ? 1 : 2;
    return `${t}-${a}`;
  };
  const global = snapshot.protocols.filter(isLive).length / snapshot.protocols.length;
  const counts = new Map<string, { n: number; live: number }>();
  for (const p of snapshot.protocols) {
    const k = bucket(p);
    const c = counts.get(k) ?? { n: 0, live: 0 };
    c.n += 1;
    if (isLive(p)) c.live += 1;
    counts.set(k, c);
  }
  const out = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const c = counts.get(bucket(p))!;
    out.set(p.slug, Math.round(((c.live + 2 * global) / (c.n + 2)) * 1000) / 1000);
  }
  return out;
}

// ------------------------------------------------------------------ board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; model: FittedModel; validation: ModelValidation } {
  const { model, validation } = fitAndValidate(snapshot);
  const beta = [model.intercept, model.log_tvl, model.log_chains];
  const odds = launchOdds(snapshot);
  const conformal = validation.conformal_80_factor;

  const scored = snapshot.protocols.map((p) => {
    const adj = adjustments(p, snapshot.as_of);
    const raw = Math.pow(10, fittedLog(beta, p)) * adj.growthMult * adj.maturityMult;
    const rawPrediction = Math.max(1, Math.round(raw));
    const reason = isPreToken(p) ? exclusionReason(p) : null;
    const status: BoardRow['token_status'] = !isPreToken(p) ? 'live' : reason === null ? 'pre-token' : 'excluded';
    // An excluded protocol cannot launch a token of its own: the $1 floor keeps the ranking a
    // launch ranking while the row still shows its model prediction for the record.
    const implied = status === 'excluded' ? 1 : rawPrediction;
    return {
      p,
      status,
      reason,
      implied,
      rawPrediction,
      adj,
      intervalLow: Math.max(1, Math.round(rawPrediction / conformal)),
      intervalHigh: Math.round(rawPrediction * conformal),
    };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: s.status,
    exclusion_reason: s.reason,
    watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.adj.age,
    implied_value_usd: s.implied,
    launch_odds: odds.get(s.p.slug)!,
    // The interval brackets the implied value: for an excluded row the value is the $1 floor,
    // so its interval is the floor too; the raw prediction keeps its own interval in model.
    interval_low_usd: s.status === 'excluded' ? 1 : s.intervalLow,
    interval_high_usd: s.status === 'excluded' ? 1 : s.intervalHigh,
    model: {
      fitted_log_value: Math.round(fittedLog(beta, s.p) * 10000) / 10000,
      growth_pct: Math.round(s.adj.growthPct * 100) / 100,
      growth_multiplier: Math.round(s.adj.growthMult * 10000) / 10000,
      maturity_multiplier: Math.round(s.adj.maturityMult * 10000) / 10000,
      raw_prediction_usd: s.rawPrediction,
      interval_low_usd: s.intervalLow,
      interval_high_usd: s.intervalHigh,
      age_days: s.adj.age,
    },
    farm_steps: farmSteps(s.p, s.adj.age, s.status).map(stepText),
  }));
  return { board, model, validation };
}

// ------------------------------------------------------------------ farm plans

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on a chain, in whole dollars: an estimate, stated as one in the plan. */
function gasFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 12;
  if (c === 'arbitrum' || c === 'optimism' || c === 'base') return 1.5;
  if (c === 'solana') return 0.05;
  if (c === 'bsc' || c === 'bnb chain') return 0.5;
  if (c === 'polygon') return 0.2;
  if (c === 'avalanche') return 1;
  return 2;
}

/** A dollar figure as the plan writes it: $0.05 stays two decimals, whole dollars stay whole. */
function gasUsd(n: number): string {
  return n < 1 ? `$${n.toFixed(2)}` : `$${n}`;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Put $${capital} of USDC to work as a lender on ${name} (${chain}) and leave the supply in place.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s main pool on ${chain} and leave the position in place.`;
  if (c.includes('bridge')) return `Move $${capital} of USDC to ${chain} through ${name}, then use the bridged funds inside its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and hold on to the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund ${name} with $${capital} and take one position on a market that settles later.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into one of ${name}'s vaults on ${chain} and hold the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The second on-chain action: a different move on the same protocol, so the wallet shows depth. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow up to 40% of the supplied value against the position, then swap what you borrowed back into the supplied asset.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Stake the liquidity receipt in ${name}'s gauge or farm, so the same capital earns points on top of trading fees.`;
  if (c.includes('bridge')) return `Send half the bridged funds back along the same route, so the wallet shows activity in both directions.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the receipt token in ${name}'s restaking vault and keep the second receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge after one funding cycle, then reopen it on the opposite side.`;
  if (c.includes('prediction')) return `Let the first position settle, then take a second one on a market that closes after it.`;
  if (c.includes('curator') || c.includes('allocator')) return `Place a second deposit in a different vault run by the same protocol.`;
  if (c.includes('stable')) return `Supply the stable asset as liquidity in ${name}'s own pool on ${chain}.`;
  if (c.includes('rwa')) return `Post the yield asset as collateral in a lending market on ${chain}.`;
  if (c.includes('insurance')) return `Stake the cover receipt in ${name}'s staking pool.`;
  return `Repeat the deposit with a second tranche, from a different wallet, on ${chain}.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a hand-written
 * list of names. Gas figures are estimates for the protocol's first chain, stated as such in
 * the plan. A pre-token protocol gets a farm-for-a-launch plan; a live or excluded protocol
 * gets a use-and-earn plan, since there is no launch to farm.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, status: BoardRow['token_status']): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, chain);
  const farming = status === 'pre-token';
  const last = farming
    ? {
        text: `If a token launches, claim only from the protocol's own announcement, sell at most half in the first week, and keep the rest staked.`,
        cost: `about ${gasUsd(gas)} of gas to claim and swap`,
        time: '30 minutes at launch',
      }
    : {
        text: `When you exit, unwind in the reverse order, keep every receipt, and write down the gain or loss for your own records.`,
        cost: `about ${gasUsd(gas)} of gas to unwind`,
        time: '30 minutes to exit',
      };
  return [
    {
      text: `Set aside a fresh wallet holding only the funds you plan to ${farming ? 'farm' : 'use'}, and keep its seed phrase offline.`,
      cost: `about ${gasUsd(gas)} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    { text: action, cost: `$${capital} of capital and about ${gasUsd(gas)} of gas`, time: '15 minutes to set up' },
    { text: second, cost: `about ${gasUsd(gas)} of gas`, time: '15 minutes' },
    {
      text: `Do one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about ${gasUsd(gas)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: farming
        ? `Hold the position for at least ${hold} days so the activity shows up in more than one snapshot.`
        : `Hold the position for at least ${hold} days to earn a full rewards cycle before you judge it.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    last,
  ];
}

// ------------------------------------------------------------------ dashboard data

/** A board row's compact form for data.js, with its farm plan, for the detail view. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    launch_odds: row.launch_odds,
    token_status: row.token_status,
    exclusion_reason: row.exclusion_reason,
    watchlist: row.watchlist,
    fitted_log_value: row.model.fitted_log_value,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    raw_prediction_usd: row.model.raw_prediction_usd,
    interval_low_usd: row.interval_low_usd,
    interval_high_usd: row.interval_high_usd,
    farm_steps: row.farm_steps,
  };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(board: BoardRow[]): LiveRow[] {
  return board
    .filter((r) => r.token_status === 'live' && r.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
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
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { board, model, validation } = buildBoard(snapshot);
  const live = liveRows(board);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    validation,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    pre_token_size: board.filter((r) => r.token_status === 'pre-token').length,
    live_size: board.filter((r) => r.token_status === 'live').length,
    excluded_size: board.filter((r) => r.token_status === 'excluded').length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
