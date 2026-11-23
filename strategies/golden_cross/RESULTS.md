# Golden Cross — Backtest Results

Run date: 2026-11-23 · Data: TradingView daily OHLCV, 2009-01-01 → 2026-11-20
(split-adjusted, **not** dividend-adjusted) · Capital ₹10,00,000 · Costs 0.15% per side.

## TL;DR

1. **The drafted "Golden Cross Plus" (V2) fails.** It made 74 trades in 17 years, was
   invested 5% of the time and lost money (CAGR −0.5%, profit factor 0.76). The stacked
   entry filters almost never line up, and the 2-ATR stop / SMA50 exit cut every trend
   early.
2. **What works with golden crosses on stocks is the opposite: enter on the cross, hold
   until the death cross, and spread across many positions.** The best in-sample rule set,
   frozen and then run once on unseen 2020–2026 data, is **C2 — Golden Cross Portfolio**
   (rules below). Out-of-sample: **CAGR 16.6% vs NIFTY 11.5%, max drawdown −19% vs −38%,
   Sharpe 1.08 vs 0.71**. It holds up across 80 nearby parameter settings and doesn't
   care about costs.
3. **Big caveat — survivorship bias.** The stock list is *today's* NIFTY 100, i.e. the
   winners. Simply buying the same list equal-weight beat C2 on return (OOS 23.6% CAGR,
   full period 18.9% vs 16.0%). So most of C2's edge over NIFTY probably comes from the
   stock list, not from the golden cross. What the cross does add is lower drawdown.
   Confirming a real edge needs point-in-time index constituents.
4. Golden-cross timing on the **NIFTY index itself** (which has no survivorship bias) did
   **not** beat buy-and-hold in either period.

## Final rule set — C2 "Golden Cross Portfolio"

| Item | Rule |
|---|---|
| Universe | NIFTY 100 stocks, daily candles |
| Entry | Day *t* close: SMA50 crosses above SMA200 → buy at day *t+1* open |
| Exit | Day *t* close: SMA50 crosses below SMA200 → sell at day *t+1* open |
| Sizing | 1/20 of current equity per new position (max 20 positions) |
| Ranking | If more crosses than free slots on a day: strongest 6-month return vs NIFTY first |
| Filters / stops | None. No regime filter, no ATR stop (all of them hurt in-sample) |

Code: `backtest.py` (`preset("V0", max_positions=20)`).

## Out-of-sample (2020-01-01 → 2026-11-20), rules frozen beforehand

| Strategy | CAGR | Max DD | Sharpe | Calmar | Trades | Win % | Profit factor |
|---|---|---|---|---|---|---|---|
| **C2 Golden Cross Portfolio** | **16.6%** | **−19.2%** | **1.08** | **0.87** | 153 | 48% | 3.28 |
| V0 plain cross, 10 slots | 10.4% | −34.8% | 0.64 | 0.30 | 96 | 47% | 2.12 |
| NIFTY golden-cross timing (cash 6%) | 4.4% | −35.2% | 0.40 | 0.13 | 9 | – | – |
| NIFTY 50 buy & hold | 11.5% | −38.4% | 0.71 | 0.30 | – | – | – |
| Same 96 stocks, equal-weight B&H | 23.6% | −37.4% | 1.28 | 0.63 | – | – | – |

The OOS drawdown of −19% looks better than it really is. The run started in cash in Jan
2020, so it was only partly invested when COVID hit. When the run starts in 2010, C2 lost
**−34%** in Feb–Mar 2020. The death cross is too slow to dodge a crash.

## Full period (2010 → 2026) and in-sample (2010–2019)

| Strategy | Full CAGR | Full Max DD | Full Sharpe | IS CAGR | IS Max DD | IS Sharpe |
|---|---|---|---|---|---|---|
| **C2 Golden Cross Portfolio** | 16.0% | −34.3% | 1.05 | 15.7% | −26.4% | 1.11 |
| V0 plain cross, 10 slots | 16.7% | −37.2% | 0.99 | 16.3% | −31.2% | 1.05 |
| V1 + SMA200 slope + regime | 10.9% | −35.7% | 0.75 | 9.9% | −29.3% | 0.73 |
| V2 drafted Golden Cross Plus | −0.5% | −13.3% | −0.18 | 0.0% | −8.8% | 0.03 |
| NIFTY 50 buy & hold | 9.9% | −38.4% | 0.67 | 8.8% | −28.0% | 0.64 |
| Same 96 stocks, EW B&H | 18.9% | −37.4% | 1.15 | 15.7% | −25.5% | 1.04 |

## In-sample search (2010–2019 only; 8 rule sets + 2 index-timing runs tried)

| Candidate | CAGR | Max DD | Sharpe | Trades | What it taught us |
|---|---|---|---|---|---|
| V0 baseline | 16.3% | −31.2% | 1.05 | 123 | Raw cross already works on this list |
| V2 draft | 0.0% | −8.8% | 0.03 | 37 | Too many filters, stops too tight |
| C1 V0 + exit below SMA200 | 9.7% | −27.9% | 0.74 | 229 | Faster exits cut the big winners |
| **C2 V0 with 20 slots** | **15.7%** | **−26.4%** | **1.11** | 221 | Diversification lowers DD at almost no cost |
| C3 cross + 3/5-ATR stops | 7.2% | −23.4% | 0.66 | 260 | Even wide stops hurt |
| C4 C3 + NIFTY regime | 8.8% | −20.4% | 0.80 | 225 | Regime filter lowers DD but costs return |
| C5 C3 + 1% risk sizing | 8.1% | −22.8% | 0.73 | 253 | Sizing doesn't fix the stop problem |
| C6 V2 without volume filter | −0.6% | −20.9% | −0.14 | 80 | Buying 20-day breakouts after the cross loses money |

C2 was picked on in-sample Sharpe/Calmar and frozen before the out-of-sample run.

## Robustness of C2

- **Parameter neighbourhood** (`results/robustness_C2.csv`): 5 slot counts (10–30) ×
  4 SMA pairs (20/100, 50/150, 50/200, 100/200) × SMA200 slope filter on/off = 40
  combos per period.
  - In-sample CAGR: 9.7% to 17.2%, median 13.1%. Out-of-sample: 9.7% to 22.3%, median 17.9%.
  - Profit factor was above 1.5 in all 80 runs. More slots (20–30) was steadily better
    out-of-sample.
- **Cost stress:** at 0.25% per side the full-period CAGR is 15.9% (vs 16.0%). Average
  holding is about 290 days, so costs barely matter.
- **Concentration:** the top 5 trades made 40% of total profit (INDHOTEL +679%, EICHERMOT
  +1169%, JSWENERGY +380%, PFC +318%, TRENT +229%). This is normal for trend following,
  but it also shows the survivorship problem: these are exactly the stocks that grew into
  the NIFTY 100.

## Year by year (full-period runs)

| Year | C2 | V0 | NIFTY 50 | Same-list EW |
|---|---|---|---|---|
| 2010 | +8.1% | +12.0% | +17.2% | +28.3% |
| 2011 | -20.8% | -24.3% | -24.6% | -20.8% |
| 2012 | +40.0% | +36.8% | +27.7% | +41.4% |
| 2013 | +14.0% | +31.7% | +6.8% | +8.1% |
| 2014 | +81.5% | +71.1% | +31.4% | +55.2% |
| 2015 | +2.9% | +8.7% | -4.1% | +0.6% |
| 2016 | +3.7% | +9.7% | +3.0% | +10.0% |
| 2017 | +45.3% | +37.3% | +28.6% | +45.7% |
| 2018 | -5.5% | -11.8% | +3.2% | -1.2% |
| 2019 | +18.1% | +20.3% | +12.0% | +11.5% |
| 2020 | +11.6% | +13.6% | +14.9% | +27.4% |
| 2021 | +44.9% | +60.3% | +24.1% | +50.6% |
| 2022 | -2.5% | -2.4% | +4.3% | +13.9% |
| 2023 | +43.4% | +42.9% | +20.0% | +42.1% |
| 2024 | +31.5% | +16.7% | +8.8% | +22.2% |
| 2025 | -2.3% | +3.7% | +10.5% | +8.7% |
| 2026 (to 20 Nov) | -1.2% | -2.3% | -1.3% | +4.5% |

## Against the pass criteria set before testing (STRATEGY.md §8)

| Criterion | C2 result | Pass? |
|---|---|---|
| OOS CAGR > NIFTY 50 B&H | 16.6% vs 11.5% | ✅ |
| Max DD lower than NIFTY 50's | OOS −19% vs −38% (start-date luck); full period −34% vs −38% | ✅ (barely, over the full period) |
| Profit factor ≥ 1.5 with ≥ 100 trades | 3.28 on 153 OOS trades; 3.50 on 360 full-period trades | ✅ |
| Holds across parameter neighbourhood | 80/80 runs PF > 1.5, CAGR ≥ 9.7% | ✅ |
| *(context, not pre-set)* Beats buying the same list | 16.0% vs 18.9% full; 16.6% vs 23.6% OOS | ❌ |

## Known limitations

- **Survivorship bias.** This is the big one. The list is today's NIFTY 100. Stocks that
  fell out of the index between 2010 and 2026 are missing, and today's winners are in.
- **No dividends.** The stock prices and the NIFTY benchmark are both price-only, so the
  comparison between them is fair. Real returns would be about 1–1.5% a year higher.
- **Short history for some stocks.** Stocks listed after 2015 (e.g. HAL, DMART, ETERNAL,
  IRFC, LODHA) only trade once they have 200 days of data. JIOFIN, HYUNDAI, SWIGGY and
  LICI were left out (too little history, or the data didn't come through).
- **Fills.** Orders fill at the next day's open with 0.15% total cost. There is no market
  impact model; that's reasonable for these large caps at ₹10 lakh.
- **Cash earns nothing** in the stock simulations.

## Files

| File | What |
|---|---|
| `backtest.py` | Engine, presets V0/V1/V2, benchmarks, main run |
| `explore_in_sample.py` | In-sample candidate search |
| `out_of_sample.py` | One-time OOS run of the frozen candidates |
| `robustness_c2.py` | Parameter neighbourhood + cost stress for C2 |
| `index_timing.py` | Golden cross on the NIFTY index |
| `build_data.py` | Turns TradingView OHLCV JSON dumps into `data/*.csv` |
| `results/*.csv` | Every table above, trade lists and equity curves |

To rerun: put one CSV per symbol in `data/` (columns `date,open,high,low,close,volume`,
plus `NIFTY.csv`), then run `python3 backtest.py`, then the other scripts. Market data is
not committed to the repo.
