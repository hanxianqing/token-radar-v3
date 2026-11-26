# Token Radar — how the board is built (radar-4)

The question this board answers: if a protocol launched a token today and the
market priced it the way it prices the tokens that already trade, what would
that token be worth? Nothing here predicts whether or when a token launches.
The snapshot is sealed DefiLlama data as of 2026-11-14: 758 protocols at or
above $5M TVL, with a $50M floor for the 40-protocol watchlist. The board
covers all 758 — 198 launch candidates, 416 live tokens, 144 excluded — and
every one of the 40 watchlist protocols is on it.

## The fit

The model is least squares on logarithms, fitted at run time on the
snapshot's own tokened protocols:

    log10(market cap) = 3.0161 + 0.5417 x log10(TVL) - 0.2248 x log10(chains)

Three things about the fit matter. First, the peers: 113 protocols that
record a token, a positive market cap and a positive TVL, with a market
cap/TVL ratio of at least 0.005. Five dust listings fall below that ratio,
and ten chain and centralised-exchange protocols are left out — a chain's
TVL is not a protocol's TVL, and neither is an exchange's. Second, the
trim: after a first fit, the 11 worst-fitting peers (one decile) are
dropped and the line is refitted on the remaining 102. R2 is 0.236 on all
113 peers and 0.328 on the 102 kept.

The trimmed eleven, alphabetical: aave-v2, bifi, bitway-earn,
flokifi-locker, gravity-bridge, kava-lend, kinetic, kyros, mantle-bridge,
merlinswap, rain. They are not ordinary protocols: their market-cap/TVL
ratios run from 0.01x to 400x — a legacy token (Aave V2, 19x), bridges
(Gravity Bridge, Mantle Bridge, 0.01x and 15x), a token locker (FlokiFi
Locker, 19x), a listing whose cap is 400x its TVL (Rain). Their market
caps have little to do with the TVL in the snapshot, so letting them drag
the line costs the typical protocol. The trim is one decile, a standard
trimmed-regression choice, and it is applied inside every validation
refit below, so no held-out protocol ever trims itself.

Third, two bounded adjustments, because growth and age fitted as noise at
this scale in plain OLS, so they nudge rather than drive:

- momentum x (1 + 0.25 x 7-day growth), growth clipped to -60% ... +120%
- maturity x (0.9 + 0.2 x min(age, 1095 days) / 1095 days); age unknown
  counts as 365 days

## What was tried and set aside

On the same held-out splits: adding log(age) as a fitted feature
(walk-forward 70/30 error x6.5 — age is a time trend, and the market
regime moved); per-category fits (too few peers per category); median
(LAD) regression (leave-one-out x2.83, close, but worse on walk-forward
and on random 80/20 splits); Huber regression (leave-one-out x3.08). The
trimmed OLS wins on every split, not just the two below.

## Held-out validation (computed in-program, before scoring anything)

- Leave-one-out: median error x2.844, 32.7% within 2x, n = 113
- Walk-forward 70/30: median x2.568 (fitted on protocols listed up to
  2025-03-07, train 58; tested on the 25 listed after it; 44.0% within 2x)
- Walk-forward 60/40: median x2.525 (cutoff 2024-08-22, train 49, test
  34; 35.3% within 2x)
- 80% held-out interval: x10.115 around every value (conformal, from
  leave-one-out)

The previous version of this radar (radar-3, plain OLS) scored
leave-one-out x3.166 and walk-forward 70/30 x3.263 on the same splits;
the trim improves both by about 10% and 21%. The top entries report
walk-forward x2.26 / leave-one-out x2.99; this model now beats the
leave-one-out figure and is within reach on walk-forward. Token values
vary widely around TVL-implied levels. The interval says so instead of
hiding it.

## How the board ranks

Rows are ranked by implied value, strongest first, ranks 1..758 exact,
ties broken by slug ascending. An excluded protocol cannot launch a token
of its own, so its launch value is the $1 floor — but it is still listed,
with its model prediction, so all 758 protocols are accounted for. The
excluded are the wrapped, staked, bridged, exchange and versioned
products: a centralised exchange (category CEX); a product whose name
begins with an exchange's name; a name ending in a version marker (V2,
V3, ...); a name carrying the whole word wrapped, staked or staking; or
a bridge / liquid-staking / restaking category.

Launch odds are a binned empirical share (TVL tercile x age tercile,
smoothed toward the global tokened share with a strength of 2): a base
rate, not a prediction of whether or when a token launches.

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

Live rows carry the model's fair value beside the market's actual cap:
Binance CEX $475,455,219 fitted (no cap in the snapshot), OKX
$241,930,580 fitted against a $1.97B market cap, Lido $247,362,748
fitted against a $251M market cap. The two are never confused.

## Farm plans

Every row carries a seven-step plan with concrete costs and times. The
first step sets aside a fresh wallet; the second and third steps depend
on what the protocol is — liquidity, lending, vaults, staking, bridging,
yield, margin, stable assets, prediction markets, insurance, or a plain
deposit — with a deposit sized by TVL ($50 under $100M, $100 under $1B,
$150 under $5B, $250 above) and gas estimated per chain (Ethereum $12,
Arbitrum / Base / Optimism $1.50, Avalanche $1, Polygon $0.20, Solana
$0.05, everything else $2). Then a weekly action, a hold (30 days, or 45
for protocols under a year old, 60 for those under six months), a warning
to claim only from the protocol's own links, and — for launch candidates —
what to do if a token launches.
