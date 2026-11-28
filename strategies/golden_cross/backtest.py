"""Golden Cross Plus — portfolio backtest on NSE daily data.

Usage:  python3 backtest.py            (writes results/ next to this file)

Variants (see STRATEGY.md):
  V0  plain golden cross in, death cross out, equal weight (10 slots)
  V1  V0 + rising SMA200 + NIFTY > SMA200 regime filter at entry
  V2  full Golden Cross Plus (confirmation trigger, ATR stops, 1% risk sizing)

Conventions
  * Signals use data up to day t close; orders fill at day t+1 open.
  * Stops are known before the day starts; if the open gaps through the stop
    the fill is the open, otherwise the stop price.
  * Costs are charged per side on traded value.
  * Prices are split-adjusted, not dividend-adjusted (same for NIFTY benchmark).
"""
from __future__ import annotations

import glob
import json
import math
import os
from dataclasses import dataclass, field, replace

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "results")


# ----------------------------------------------------------------- params
@dataclass(frozen=True)
class Params:
    variant: str = "V2"             # label; behaviour comes from the switches below
    entry_mode: str = "plus"        # "cross" = buy day after cross, "plus" = V2 trigger
    use_slope: bool = True
    use_regime: bool = True
    use_stops: bool = True          # initial ATR stop + chandelier trail + breakeven
    use_below_fast: bool = True     # exit after N closes below SMA50
    exit_below_slow: bool = False   # exit on close below SMA200
    sizing: str = "risk"            # "risk" (1% risk) or "equal" (1/max_positions)
    fast: int = 50
    slow: int = 200
    cross_window: int = 20          # golden cross must be this fresh
    slope_lookback: int = 20        # SMA200 rising vs N days ago
    breakout_len: int = 20          # close > highest high of previous N
    vol_mult: float = 1.5
    rsi_lo: float = 50
    rsi_hi: float = 75
    max_ext: float = 0.10           # close <= SMA50 * (1 + max_ext)
    stop_atr: float = 2.0           # initial stop
    trail_atr: float = 3.0          # chandelier
    be_r: float = 2.0               # move stop to entry after +2R
    below_fast_days: int = 2        # exit after N closes below SMA50
    risk_pct: float = 0.01
    max_pos_pct: float = 0.15
    max_positions: int = 10
    cost: float = 0.0015            # per side
    capital: float = 1_000_000.0


PRESETS = {
    "V0": dict(entry_mode="cross", use_slope=False, use_regime=False, use_stops=False,
               use_below_fast=False, sizing="equal", cross_window=0),
    "V1": dict(entry_mode="cross", use_slope=True, use_regime=True, use_stops=False,
               use_below_fast=False, sizing="equal", cross_window=0),
    "V2": dict(),
}


def preset(name: str, **kw) -> Params:
    return replace(Params(variant=name), **{**PRESETS.get(name, {}), **kw})


# ----------------------------------------------------------------- data
def load_data():
    frames = {}
    for f in sorted(glob.glob(os.path.join(DATA, "*.csv"))):
        sym = os.path.basename(f)[:-4]
        df = pd.read_csv(f, index_col=0, parse_dates=True)
        frames[sym] = df
    nifty = frames.pop("NIFTY")
    # last bar of the feed is still forming -> drop it everywhere
    last = nifty.index[-1]
    nifty = nifty.loc[nifty.index < last]
    frames = {s: d.loc[d.index < last] for s, d in frames.items()}
    return nifty, frames


def wilder(x: pd.Series, n: int) -> pd.Series:
    return x.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def indicators(df: pd.DataFrame, p: Params) -> pd.DataFrame:
    c, h, l = df.close, df.high, df.low
    out = pd.DataFrame(index=df.index)
    out["fast"] = c.rolling(p.fast).mean()
    out["slow"] = c.rolling(p.slow).mean()
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    out["atr"] = wilder(tr, 14)
    d = c.diff()
    rs = wilder(d.clip(lower=0), 14) / wilder((-d).clip(lower=0), 14)
    out["rsi"] = 100 - 100 / (1 + rs)
    out["volavg"] = df.volume.rolling(20).mean().shift(1)
    out["hh"] = h.rolling(p.breakout_len).max().shift(1)
    above = out.fast > out.slow
    prev = above.shift(1, fill_value=False)
    valid = out.slow.notna() & out.slow.shift(1).notna()
    out["gc"] = above & ~prev & valid                    # golden cross today
    out["dc"] = ~above & prev & valid                    # death cross today
    # bars since last golden cross (inf if none)
    idx = np.arange(len(out), dtype=float)
    last_gc = pd.Series(np.where(out.gc, idx, np.nan), index=out.index).ffill()
    out["since_gc"] = idx - last_gc.values
    out["gc_id"] = last_gc                               # identifies the cross event
    out["slow_rising"] = out.slow > out.slow.shift(p.slope_lookback)
    out["ret126"] = c / c.shift(126) - 1
    out["below_fast"] = (c < out.fast).astype(int)
    out["below_fast_run"] = out.below_fast.groupby((out.below_fast == 0).cumsum()).cumsum()
    return out


# ----------------------------------------------------------------- engine
@dataclass
class Pos:
    sym: str
    qty: int
    entry: float
    entry_date: pd.Timestamp
    init_stop: float
    stop: float
    risk: float
    hi_close: float
    gc_id: float
    exit_next_open: str | None = None


@dataclass
class Result:
    equity: pd.Series
    trades: pd.DataFrame
    exposure: pd.Series


def run(p: Params, nifty, frames, start, end) -> Result:
    cal = nifty.index
    nclose = nifty.close.values
    nsma = nifty.close.rolling(200).mean().values
    nret = (nifty.close / nifty.close.shift(126) - 1).values
    regime = nclose > nsma
    d0, d1 = cal.searchsorted(pd.Timestamp(start)), cal.searchsorted(pd.Timestamp(end), side="right")

    A = {}
    for s, f in frames.items():
        px = f.reindex(cal)
        ind = indicators(f, p).reindex(cal)
        a = {k: px[k].values.astype(float) for k in ("open", "high", "low", "close", "volume")}
        a["lastclose"] = px.close.ffill().values
        for k in ("fast", "slow", "atr", "rsi", "volavg", "hh", "since_gc", "gc_id", "ret126", "below_fast_run"):
            a[k] = ind[k].values.astype(float)
        for k in ("gc", "dc", "slow_rising"):
            a[k] = ind[k].fillna(False).values.astype(bool)
        A[s] = a
    syms = list(A)

    cash = p.capital
    pos: dict[str, Pos] = {}
    used_cross: set = set()
    pending: list = []
    trades, eq, expo = [], [], []

    def close_pos(ps: Pos, price: float, d, reason: str):
        nonlocal cash
        proceeds = ps.qty * price * (1 - p.cost)
        cash += proceeds
        cost_in = ps.qty * ps.entry * (1 + p.cost)
        trades.append(dict(sym=ps.sym, entry_date=ps.entry_date, exit_date=d, entry=ps.entry,
                           exit=price, qty=ps.qty, pnl=proceeds - cost_in,
                           ret=proceeds / cost_in - 1,
                           r=(price - ps.entry) / ps.risk if ps.risk > 0 else np.nan,
                           days=(d - ps.entry_date).days, reason=reason))

    prev_equity = p.capital
    for i in range(d0, d1):
        d = cal[i]
        # 1. open: queued exits, gap stops, then queued entries
        for s in list(pos):
            ps, a = pos[s], A[s]
            o = a["open"][i]
            if np.isnan(o):
                continue
            if ps.exit_next_open:
                close_pos(ps, o, d, ps.exit_next_open); del pos[s]
            elif p.use_stops and o <= ps.stop:
                close_pos(ps, o, d, "stop_gap"); del pos[s]
        for s, gid in pending:
            if len(pos) >= p.max_positions or s in pos:
                continue
            a = A[s]
            o = a["open"][i]
            if np.isnan(o) or o <= 0:
                continue
            if p.use_stops:
                risk = p.stop_atr * a["atr"][i - 1]
                stop = o - risk
            else:
                risk, stop = 0.0, -np.inf
            if p.sizing == "risk" and risk > 0:
                qty = min(prev_equity * p.risk_pct / risk, prev_equity * p.max_pos_pct / o)
            else:
                qty = prev_equity / p.max_positions / o
            qty = int(min(qty, cash / (o * (1 + p.cost))))
            if qty <= 0:
                continue
            cash -= qty * o * (1 + p.cost)
            pos[s] = Pos(s, qty, o, d, stop, stop, risk, o, gid)
            used_cross.add((s, gid))
        pending = []

        # 2. intraday stops
        if p.use_stops:
            for s in list(pos):
                ps = pos[s]
                lo = A[s]["low"][i]
                if not np.isnan(lo) and lo <= ps.stop:
                    close_pos(ps, ps.stop, d, "stop"); del pos[s]

        # 3. close: mark to market, trail stops, queue exits
        mv = 0.0
        for s, ps in pos.items():
            a = A[s]
            mv += ps.qty * a["lastclose"][i]
            c = a["close"][i]
            if np.isnan(c):
                continue
            ps.hi_close = max(ps.hi_close, c)
            if p.use_stops:
                if ps.hi_close >= ps.entry + p.be_r * ps.risk:
                    ps.stop = max(ps.stop, ps.entry)
                if not np.isnan(a["atr"][i]):
                    ps.stop = max(ps.stop, ps.hi_close - p.trail_atr * a["atr"][i])
            if p.use_below_fast and a["below_fast_run"][i] >= p.below_fast_days:
                ps.exit_next_open = ps.exit_next_open or "below_sma50"
            if p.exit_below_slow and c < a["slow"][i]:
                ps.exit_next_open = ps.exit_next_open or "below_sma200"
            if a["dc"][i]:
                ps.exit_next_open = ps.exit_next_open or "death_cross"
        equity = cash + mv
        eq.append(equity); expo.append(mv / equity if equity else 0.0)
        prev_equity = equity

        # 4. entry signals for tomorrow
        free = p.max_positions - sum(1 for ps in pos.values() if not ps.exit_next_open)
        if free <= 0 or (p.use_regime and not regime[i]):
            continue
        cands = []
        for s in syms:
            if s in pos:
                continue
            a = A[s]
            c = a["close"][i]
            if np.isnan(c) or np.isnan(a["slow"][i]):
                continue
            if p.entry_mode == "cross":
                ok = (a["since_gc"][i] <= p.cross_window if p.cross_window else a["gc"][i]) \
                    and a["fast"][i] > a["slow"][i] \
                    and (not p.use_slope or a["slow_rising"][i]) \
                    and (s, a["gc_id"][i]) not in used_cross
            else:
                ok = (a["since_gc"][i] <= p.cross_window and a["fast"][i] > a["slow"][i]
                      and a["slow_rising"][i] and c > a["hh"][i]
                      and a["volume"][i] > p.vol_mult * a["volavg"][i]
                      and p.rsi_lo <= a["rsi"][i] <= p.rsi_hi
                      and c <= a["fast"][i] * (1 + p.max_ext)
                      and (s, a["gc_id"][i]) not in used_cross)
            if ok:
                rs = a["ret126"][i] - nret[i]
                cands.append((-(rs if not np.isnan(rs) else -9.0), s, a["gc_id"][i]))
        cands.sort()
        pending = [(s, g) for _, s, g in cands[:free]]

    last = cal[d1 - 1]
    for s, ps in list(pos.items()):
        close_pos(ps, A[s]["lastclose"][d1 - 1], last, "open_at_end")
    dates = cal[d0:d1]
    equity = pd.Series(eq, index=dates)
    equity.iloc[-1] = cash
    return Result(equity, pd.DataFrame(trades), pd.Series(expo, index=dates))


# ----------------------------------------------------------------- benchmarks
def nifty_bh(nifty, start, end, capital):
    c = nifty.close.loc[start:end]
    return capital * c / c.iloc[0]


def universe_ew(frames, nifty, start, end, capital):
    """Equal-weight, monthly-rebalanced buy & hold of the same stock list
    (a stock joins once it has 200 days of history). Shows how much of any
    result comes from the (survivorship-biased) stock list itself."""
    idx = nifty.loc[start:end].index
    closes = pd.DataFrame({s: f.close for s, f in frames.items()}).reindex(nifty.index).ffill()
    rets = closes.pct_change()
    eligible = closes.notna().cumsum() >= 200
    month = idx.to_period("M")
    w = None
    vals, v = [], capital
    for i, d in enumerate(idx):
        if i == 0 or month[i] != month[i - 1]:
            el = eligible.loc[d]
            w = el / el.sum()
            if i > 0:
                v *= 1 - 0.0015 * 0.2        # rough turnover cost
        if i > 0:
            r = (w * rets.loc[d].fillna(0)).sum()
            v *= 1 + r
            w = w * (1 + rets.loc[d].fillna(0))
            w = w / w.sum()
        vals.append(v)
    return pd.Series(vals, index=idx)


# ----------------------------------------------------------------- metrics
def metrics(equity: pd.Series, trades: pd.DataFrame | None = None, expo=None) -> dict:
    yrs = (equity.index[-1] - equity.index[0]).days / 365.25
    cagr = (equity.iloc[-1] / equity.iloc[0]) ** (1 / yrs) - 1
    dr = equity.pct_change().dropna()
    sharpe = dr.mean() / dr.std() * math.sqrt(252) if dr.std() > 0 else np.nan
    dd = equity / equity.cummax() - 1
    mdd = dd.min()
    m = dict(final=equity.iloc[-1], cagr=cagr, max_dd=mdd, sharpe=sharpe,
             calmar=cagr / abs(mdd) if mdd < 0 else np.nan)
    if trades is not None and len(trades):
        t = trades
        wins, losses = t[t.pnl > 0], t[t.pnl <= 0]
        m.update(trades=len(t), win_rate=len(wins) / len(t),
                 profit_factor=wins.pnl.sum() / -losses.pnl.sum() if len(losses) and losses.pnl.sum() < 0 else np.nan,
                 avg_win=wins.ret.mean(), avg_loss=losses.ret.mean(),
                 expectancy_pct=t.ret.mean(), avg_r=t.r.mean(),
                 avg_days=t.days.mean())
    if expo is not None:
        m["time_in_market"] = expo.mean()
    return m


def yearly(equity: pd.Series) -> pd.Series:
    y = equity.groupby(equity.index.year).last()
    first = equity.iloc[0]
    return y.pct_change().fillna(y.iloc[0] / first - 1)


# ----------------------------------------------------------------- main
def main():
    os.makedirs(OUT, exist_ok=True)
    nifty, frames = load_data()
    periods = {"full": ("2010-01-01", str(nifty.index[-1].date())),
               "in_sample": ("2010-01-01", "2019-12-31"),
               "out_of_sample": ("2020-01-01", str(nifty.index[-1].date()))}
    base = Params()
    summary, curves, yearly_tbl = [], {}, {}

    for pname, (a, b) in periods.items():
        for v in ("V0", "V1", "V2"):
            r = run(preset(v), nifty, frames, a, b)
            m = metrics(r.equity, r.trades, r.exposure)
            summary.append(dict(period=pname, variant=v, **m))
            if pname == "full":
                curves[v] = r.equity
                yearly_tbl[v] = yearly(r.equity)
                r.trades.to_csv(os.path.join(OUT, f"trades_{v}.csv"), index=False)
        bh = nifty_bh(nifty, a, b, base.capital)
        summary.append(dict(period=pname, variant="NIFTY50 B&H", **metrics(bh)))
        ew = universe_ew(frames, nifty, a, b, base.capital)
        summary.append(dict(period=pname, variant="Universe EW B&H", **metrics(ew)))
        if pname == "full":
            curves["NIFTY50 B&H"] = bh
            curves["Universe EW B&H"] = ew
            yearly_tbl["NIFTY50 B&H"] = yearly(bh)
            yearly_tbl["Universe EW B&H"] = yearly(ew)

    pd.DataFrame(summary).to_csv(os.path.join(OUT, "summary.csv"), index=False)
    pd.DataFrame(curves).to_csv(os.path.join(OUT, "equity_curves.csv"))
    pd.DataFrame(yearly_tbl).to_csv(os.path.join(OUT, "yearly_returns.csv"))

    # ---- robustness grid (V2, in-sample and out-of-sample separately)
    grid = []
    for fast, slow in ((20, 50), (50, 150), (50, 200)):
        for sa in (2.0, 2.5, 3.0):
            for cw in (10, 20, 30):
                pp = preset("V2", fast=fast, slow=slow, stop_atr=sa, cross_window=cw)
                for pname in ("in_sample", "out_of_sample"):
                    a, b = periods[pname]
                    r = run(pp, nifty, frames, a, b)
                    m = metrics(r.equity, r.trades)
                    grid.append(dict(period=pname, fast=fast, slow=slow, stop_atr=sa, cross_window=cw,
                                     cagr=m["cagr"], max_dd=m["max_dd"], sharpe=m["sharpe"],
                                     profit_factor=m.get("profit_factor"), trades=m.get("trades")))
    pd.DataFrame(grid).to_csv(os.path.join(OUT, "robustness_grid.csv"), index=False)

    # ---- cost stress
    stress = []
    for pname in ("full", "out_of_sample"):
        a, b = periods[pname]
        r = run(preset("V2", cost=0.0025), nifty, frames, a, b)
        stress.append(dict(period=pname, cost_per_side=0.0025, **metrics(r.equity, r.trades)))
    pd.DataFrame(stress).to_csv(os.path.join(OUT, "cost_stress.csv"), index=False)

    meta = dict(symbols=len(frames), first=str(nifty.index[0].date()), last=str(nifty.index[-1].date()))
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=1)
    print("done", meta)


if __name__ == "__main__":
    main()
