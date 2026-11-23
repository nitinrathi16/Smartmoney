# Golden Cross Plus — Strategy Draft (v0.1)

> Status: **DRAFT** — rules are not backtested yet. Every number below is a
> starting assumption to be tested; none is a claim about performance.

## 1. Idea

A *golden cross* is when the 50-day SMA crosses above the 200-day SMA. It
marks a shift from a down/sideways trend to an uptrend.

The plain version has known problems:

| Problem | Why it hurts |
|---|---|
| Lag | Both averages are slow, so a large part of the move is gone before the signal fires. |
| Whipsaws | In sideways markets the 50 and 200 cross back and forth, giving repeated small losses. |
| Exit is too late | Waiting for the death cross (50 below 200) gives back a lot of profit. |
| No risk control | No stop loss, no position sizing. |

**Golden Cross Plus** keeps the cross as the *trend filter* and adds:
a market-regime filter, a confirmation trigger, an ATR stop, a trailing exit
and fixed-risk position sizing.

## 2. Scope

| Item | Default |
|---|---|
| Market | NSE cash equities (long only) |
| Universe | NIFTY 100 constituents (liquid large/mid caps) |
| Timeframe | Daily candles |
| Holding style | Positional / swing, weeks to months |
| Benchmark | NIFTY 50 buy-and-hold |

## 3. Indicators

- `SMA50`, `SMA200` — simple moving averages of close
- `EMA20` — short-term trend
- `ATR14` — volatility, used for stops
- `RSI14` — momentum
- `VolAvg20` — 20-day average volume
- `HH20` — highest high of the previous 20 sessions

## 4. Entry rules (all must be true on day *t* close; buy at *t+1* open)

**A. Trend setup — the golden cross**
1. `SMA50` crossed above `SMA200` within the last **20** sessions (fresh cross,
   don't chase old ones).
2. `SMA50 > SMA200` still holds on day *t*.
3. `SMA200` is rising: `SMA200[t] > SMA200[t-20]`. (Cuts crosses that happen
   in flat or falling markets — the main source of whipsaws.)

**B. Market regime filter**
4. NIFTY 50 close > NIFTY 50 `SMA200`. (Don't buy stock breakouts in a bear
   market.)

**C. Confirmation trigger**
5. Close > `HH20` (breakout to a 20-day high) **and**
6. Volume > **1.5 ×** `VolAvg20` (institutional participation).
7. `RSI14` between **50 and 75** (momentum, but not blown-off).

**D. Don't chase**
8. Close is no more than **10%** above `SMA50`.

## 5. Exit rules (first one hit wins)

| # | Exit | Rule |
|---|---|---|
| 1 | Initial stop | Entry price − **2 × ATR14** (fixed at entry). |
| 2 | Breakeven | Once price reaches **+2R**, move stop to entry price. |
| 3 | Trailing stop | Chandelier: highest close since entry − **3 × ATR14**. Stop only moves up. |
| 4 | Trend break | Close below `SMA50` for **2 consecutive** sessions. |
| 5 | Death cross | `SMA50` crosses below `SMA200` (backstop exit). |

Stops are checked against the daily low; if a stock gaps below the stop, the
exit is at that day's open (not the stop price).

## 6. Position sizing and portfolio rules

- Risk per trade: **1%** of current equity.
  `qty = (equity × 1%) / (entry − stop)`
- Max position size: **15%** of equity.
- Max open positions: **10**.
- If more signals than free slots on the same day: rank by relative strength
  (6-month return vs NIFTY 50), take the strongest.
- No pyramiding in v0.1.

## 7. Costs (Indian delivery trades)

Assume **0.15% per side** (STT 0.1% + exchange/SEBI/stamp/GST + slippage).
≈ 0.30% round trip.

## 8. Backtest plan

**Data:** daily OHLCV, 2010-01-01 → latest, NIFTY 100 stocks + NIFTY 50 index.

**Variants to compare**

| Variant | Description |
|---|---|
| V0 Baseline | Buy on golden cross, sell on death cross. No filters, no stops. |
| V1 Regime | V0 + rising SMA200 + NIFTY regime filter (rules 3, 4). |
| V2 Full | Golden Cross Plus as written above. |
| Benchmark | NIFTY 50 buy-and-hold. |

**Split**
- In-sample: 2010–2019 (any tuning happens only here).
- Out-of-sample: 2020 → latest (run once, rules frozen).

**Metrics:** CAGR, max drawdown, Sharpe, Calmar, win rate, profit factor,
average win/loss in R, expectancy per trade, number of trades, avg holding
days, time in market, year-by-year returns.

**Robustness checks**
- Parameter sensitivity: SMA pair (20/50, 50/150, 50/200), ATR multiple
  (2/2.5/3), cross window (10/20/30). A good strategy should work across a
  neighbourhood of values, not one magic setting.
- Cost stress: re-run at 0.25% per side.
- Survivorship-bias note: using today's NIFTY 100 list overstates results;
  report this caveat or use historical constituents if available.

**What counts as "winning"** (decided before the test, to avoid fitting)
- Out-of-sample CAGR > NIFTY 50 buy-and-hold, **and**
- Max drawdown lower than NIFTY 50's, **and**
- Profit factor ≥ 1.5 with at least 100 trades total, **and**
- Results hold across the parameter neighbourhood.

## 9. Open questions

1. Universe: NIFTY 100 stocks, NIFTY 50 only, or trade the index itself
   (NIFTY / BANKNIFTY)?
2. Capital to simulate (default ₹10,00,000)?
3. Long only, or also short on death cross (would need F&O)?
4. Daily only, or also test weekly candles?
