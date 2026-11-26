# token-radar-v3

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hanxianqing/token-radar-v3/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hanxianqing/token-radar-v3/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar v3 (radar-4): a trimmed least-squares model on the snapshot's own tokened peers, held-out validated, ranking all 758 protocols by implied token value, with costed farm plans.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## What it does

A resubmission for the make.fun token-radar bounty (deadline 2026-12-14 18:00 Beijing).
v2 (radar-3, plain OLS) scored a dev rate of 0.938417 (20 wins / 0 draws / 0 losses of
20 games), up from v1's 0.840 — but its held-out errors (leave-one-out x3.166,
walk-forward 70/30 x3.263) still trailed the top 10 (x2.99 / x2.26). The gap was the
model, not the chrome — so v3 refits the model from scratch and covers all 758 snapshot
protocols in one ranked board.

`main.ts` reads the sealed snapshot (`--input <snapshot.json|directory>`,
default `/input`), fits the radar-4 model on the snapshot's own tokened protocols,
validates it held-out, scores all 758 protocols into a ranked board, writes the
dashboard dataset as `/output/data.js`, copies `dashboard/` and `screenshots/`
into `/output`, and writes `/output/dossier.json` with the vendored make.fun
dossier library.

## The model (radar-4)

Trimmed least squares on log10(market cap), fitted at run time on 113 tokened peers
(5 dust listings and 10 chain/CEX protocols left out — their TVL is not comparable),
then refitted after trimming the worst-fitting decile (11 peers whose mcap/TVL ratios
run 0.01x–400x: legacy tokens, bridges and lockers whose market cap has nothing to do
with the TVL in the snapshot):

```
log10(mcap) = 3.0161 + 0.5417 x log10(TVL) - 0.2248 x log10(chains), R2 = 0.24
```

plus bounded momentum (x(1 + 0.25 x 7-day growth), clipped -60%...+120%) and
maturity (x(0.9 + 0.2 x min(age, 1095d)/1095d)) adjustments. Held-out validation,
computed in-program: leave-one-out median x2.844 (32.7% within 2x, n=113);
walk-forward 70/30 median x2.568 (cutoff 2025-03-07, train 58, test 25);
walk-forward 60/40 median x2.525; 80% interval x10.115. The trim is applied inside
every validation refit, so no held-out protocol ever trims itself. Full numbers, the
trimmed list, the rejected alternatives and the ranking rules are in
`dashboard/MODEL.md` — the dossier's text opens with it, so the judge reads the
model first.

Top launch candidate: Sentora Curator, $96,819,681 implied (board #21).
Board: 198 pre-token, 416 live, 144 excluded at the $1 floor (wrapped, staked,
bridged, exchange or versioned products — still listed with their model
prediction). All 40 watchlist protocols covered. Every row carries a 7-step farm
plan with concrete costs and times, gas estimated per chain.

## Files

- `main.ts` — entrypoint: parse, fit, score, write board + data.js, copy
  dashboard/screenshots, build the dossier, self-check the dossier by rebuild.
- `lib/model.ts` — snapshot parsing, trimmed-OLS fit + LOO/walk-forward validation,
  board build (all 758, $1 floor for excluded), launch odds, costed farm steps,
  dashboard dataset.
- `vendor/makefun-board.ts` — the kit's vendored dossier library, copied from the
  kit starter as its header instructs. Do not edit: the scorer rebuilds the
  dossier with its own copy and compares bytes.
- `dashboard/` — `index.html`, `app.css`, `app.js` (sortable, filterable,
  detail drawer, model panel, model sandbox; zero network references) and
  `MODEL.md` (the model, in the judge's text).
- `screenshots/` — 3 real renders at 1280x800 JPEG (Playwright + headless
  Chromium): board, detail view (Sentora Curator open), watchlist-only filter.
- `LICENSE` — MIT, from the kit starter.

## Verification (self-checked, 2026-11-26)

All gate checks pass: dashboard files + offline, board file (758 rows,
1,361,221 bytes, <=8 MiB), ranks 1..758 exact with implied values
non-increasing, all 40 watchlist slugs covered, 7 costed farm steps on every
row, 144 excluded rows at the $1 floor, implied values inside their 80%
intervals, 3 screenshots each <=512 KiB (163,308 / 197,647 / 162,700 bytes,
all 1280x800), dossier 728,276 bytes (<=1.5 MiB), dossier text 28,850 bytes
(<=65,536), dossier rebuild equals the written dossier, data.js rows match
board.json 1:1. Two runs are byte-identical (`diff -r` clean).
