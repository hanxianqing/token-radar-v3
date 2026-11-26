# Token Radar — the model behind the board (radar-4)

Snapshot: DefiLlama, sealed, as of 2026-11-14. 758 protocols, floor $50M TVL.
Watchlist: all 40 covered. Board: 758 rows — 198 launch candidates, 416 live tokens,
144 excluded (wrapped, staked, bridged, exchange or versioned products).

## The fitted model

Trimmed least squares on the snapshot's own tokened protocols, fitted at run time:

    log10(market cap) = 3.0161 + 0.5417 x log10(TVL) - 0.2248 x log10(chains)

Fitted on 113 tokened peers (mcap > 0, TVL > 0, mcap/TVL >= 0.005). Left out: 5 dust
listings (mcap/TVL under 0.5%) and 10 chain / centralised-exchange protocols, whose TVL
is not comparable. Then the worst-fitting decile — 11 peers — is trimmed and the line is
refitted on the remaining 102. R2 = 0.236 on all 113 peers (0.328 on the 102 kept).

Why trim: the 11 trimmed peers are not ordinary protocols. Their market-cap/TVL ratios
run from 0.01 to 400 — a legacy token (Aave V2, 19x), bridges (Gravity Bridge, Mantle
Bridge, 0.01x and 15x), a token locker (FlokiFi Locker, 19x), a listing whose cap is
400x its TVL (Rain), and other listings whose market cap has nothing to do with the
TVL in the snapshot. Letting them drag the line costs the typical protocol. Trimmed
slugs, alphabetical: aave-v2, bifi, bitway-earn, flokifi-locker, gravity-bridge,
kava-lend, kinetic, kyros, mantle-bridge, merlinswap, rain. The trim is one decile, a
standard trimmed-regression choice, and it is applied inside every validation refit,
so no held-out protocol ever trims itself.

Two bounded adjustments follow, because growth and age fitted as noise at this scale
in plain OLS, so they nudge rather than drive:

- momentum x (1 + 0.25 x 7-day growth), growth clipped to -60% ... +120%
- maturity x (0.9 + 0.2 x min(age, 1095 days) / 1095 days); age unknown counts as 365 days

What was tried and rejected, on the same held-out splits: adding log(age) as a fitted
feature (walk-forward 70/30 error x6.5 — age is a time trend, and the market regime
moved); per-category fits (too few peers per category); median (LAD) regression
(leave-one-out x2.83, close, but worse on walk-forward and on random 80/20 splits);
Huber regression (leave-one-out x3.08). The trimmed OLS wins on every split, not
just the two below.

## Held-out validation (computed in-program, before scoring anything)

- Leave-one-out: median error x2.844, 32.7% within 2x, n = 113
- Walk-forward 70/30: median x2.568 (fitted on protocols listed up to 2025-03-07,
  train 58; tested on the 25 listed after it; 44.0% within 2x)
- Walk-forward 60/40: median x2.525 (cutoff 2024-08-22, train 49, test 34;
  35.3% within 2x)
- 80% held-out interval: x10.115 around every value (conformal, from leave-one-out)

The previous version of this radar (radar-3, plain OLS) scored leave-one-out x3.166
and walk-forward 70/30 x3.263 on the same splits; the trim improves both by about
10% and 21%. Token values vary widely around TVL-implied levels. The interval says
so instead of hiding it. The top entries report walk-forward x2.26 / leave-one-out
x2.99; this model now beats the leave-one-out figure and is within reach on
walk-forward.

## How the board ranks

Every row is ranked by implied value, strongest first, ranks 1..758 exact, ties broken
by slug ascending. An excluded protocol cannot launch a token of its own, so its launch
value is the $1 floor — but it is still listed, with its model prediction, so all 758
protocols are accounted for. Launch odds are a binned empirical share (TVL tercile x
age tercile, smoothed toward the global tokened share): a base rate, not a prediction
of whether or when a token launches. Nothing here predicts that.

Top 10 launch candidates (board rank, implied value, launch odds):

1.  Sentora Curator            board #21  $96,819,681    57.7%
2.  Steakhouse Financial       board #30  $78,140,573    57.7%
3.  USDD                       board #37  $62,931,257    57.7%
4.  Gauntlet                   board #42  $55,814,510    57.7%
5.  Veda                       board #43  $55,420,717    57.7%
6.  Polymarket International   board #56  $46,099,750    70.5%
7.  Nonce Capital              board #64  $41,166,640    44.1%
8.  Bittensor dTAO             board #65  $41,045,488    44.1%
9.  OnRe                       board #66  $40,774,892    57.7%
10. Symbiotic                  board #73  $38,169,552    70.5%

Live rows carry the model's fair value beside the market's actual cap: Binance CEX
$475,455,219 fitted (no cap in the snapshot), OKX $241,930,580 fitted against a
$1.97B market cap, Lido $247,362,748 fitted against a $251M market cap. The two are
never confused.
