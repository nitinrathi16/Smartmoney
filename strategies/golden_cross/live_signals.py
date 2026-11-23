"""Live signals for C2 "Golden Cross Portfolio" (see RESULTS.md).

Rules (frozen from the backtest):
  BUY   SMA50 crossed above SMA200 at today's close  -> buy at next open
  SELL  SMA50 crossed below SMA200 at today's close  -> sell at next open
  Size  1/20 of equity per position, max 20 positions
  Rank  if more BUYs than free slots: higher 6-month return vs NIFTY first

Extra states shown in the scanner (information only, not trade signals):
  HOLD   SMA50 above SMA200 (still in a golden-cross trend)
  WATCH  SMA50 below SMA200 but within 1% and closing the gap -> cross may come soon
  AVOID  SMA50 below SMA200

Feed it **completed daily bars only** (drop today's forming bar during market
hours), otherwise a cross can appear and vanish intraday.

Backend wiring (FastAPI):

    from strategies.golden_cross.live_signals import make_router
    app.include_router(make_router(load_daily=my_loader, universe=my_symbols))

where my_loader(symbol) -> DataFrame with a DatetimeIndex and a `close` column
(plus "NIFTY" for the index), and my_symbols() -> list of symbols to scan.
"""
from __future__ import annotations

import math
from typing import Callable, Iterable

import pandas as pd

FAST, SLOW = 50, 200
SLOTS = 20
RS_LOOKBACK = 126          # ~6 months of sessions
WATCH_GAP_PCT = 1.0
STATE_ORDER = {"BUY": 0, "WATCH": 1, "HOLD": 2, "SELL": 3, "AVOID": 4}


def _f(x) -> float | None:
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), 2)


def c2_state(close: pd.Series, nifty_ret126: float | None = None,
             fast: int = FAST, slow: int = SLOW) -> dict | None:
    """C2 state for one symbol from its daily closes (oldest first)."""
    close = close.dropna()
    if len(close) < slow + 1:
        return None
    f = close.rolling(fast).mean()
    s = close.rolling(slow).mean()
    above = f > s
    now, prev = bool(above.iloc[-1]), bool(above.iloc[-2])
    valid_prev = not math.isnan(s.iloc[-2])

    flips = above.ne(above.shift())
    flips.iloc[: slow - 1] = False                      # ignore the warm-up period
    flip_idx = [i for i, v in enumerate(flips.values) if v]
    days_since = (len(close) - 1 - flip_idx[-1]) if flip_idx else None

    spread = (f.iloc[-1] / s.iloc[-1] - 1) * 100
    spread_5 = (f.iloc[-6] / s.iloc[-6] - 1) * 100 if len(close) > slow + 5 else float("nan")

    if valid_prev and now and not prev:
        state = "BUY"
    elif valid_prev and prev and not now:
        state = "SELL"
    elif now:
        state = "HOLD"
    elif spread > -WATCH_GAP_PCT and spread > spread_5:
        state = "WATCH"
    else:
        state = "AVOID"

    ret126 = close.iloc[-1] / close.iloc[-1 - RS_LOOKBACK] - 1 if len(close) > RS_LOOKBACK else float("nan")
    rs = ret126 - nifty_ret126 if nifty_ret126 is not None and not math.isnan(ret126) else float("nan")
    return {
        "gc_state": state,
        "gc_days_since_cross": days_since,
        "gc_spread_pct": _f(spread),
        "gc_sma50": _f(f.iloc[-1]),
        "gc_sma200": _f(s.iloc[-1]),
        "gc_rs_6m_pct": _f(rs * 100 if not math.isnan(rs) else float("nan")),
        "gc_as_of": str(pd.Timestamp(close.index[-1]).date()),
    }


def c2_scan(closes: dict[str, pd.Series], nifty_close: pd.Series,
            held: Iterable[str] = (), slots: int = SLOTS) -> dict:
    """Scan many symbols. `held` = symbols already in the C2 portfolio (optional)."""
    n = nifty_close.dropna()
    nifty_ret = n.iloc[-1] / n.iloc[-1 - RS_LOOKBACK] - 1 if len(n) > RS_LOOKBACK else None
    held = set(held)

    rows = []
    for sym, c in closes.items():
        st = c2_state(c, nifty_ret)
        if st:
            rows.append({"symbol": sym, **st})

    buys = sorted((r for r in rows if r["gc_state"] == "BUY" and r["symbol"] not in held),
                  key=lambda r: -(r["gc_rs_6m_pct"] if r["gc_rs_6m_pct"] is not None else -1e9))
    sells = [r for r in rows if r["gc_state"] == "SELL"]
    free = max(0, slots - len(held - {r["symbol"] for r in sells})) if held else slots
    for i, r in enumerate(buys):
        r["gc_rank"] = i + 1
        r["gc_take"] = i < free
    as_of = max((r["gc_as_of"] for r in rows), default=None)
    return {
        "strategy": "C2 Golden Cross Portfolio",
        "rules": f"Buy next open on SMA{FAST}/SMA{SLOW} golden cross, sell next open on death cross, "
                 f"{slots} equal slots, rank by 6-month return vs NIFTY.",
        "asOf": as_of,
        "slots": slots,
        "held": sorted(held),
        "freeSlots": free,
        "buys": buys,
        "sells": sells,
        "results": sorted(rows, key=lambda r: (STATE_ORDER[r["gc_state"]], r["symbol"])),
    }


def make_router(load_daily: Callable[[str], pd.DataFrame], universe: Callable[[], list[str]],
                load_held: Callable[[], Iterable[str]] | None = None, index_symbol: str = "NIFTY"):
    """FastAPI router: GET /api/strategies/golden-cross"""
    from fastapi import APIRouter

    router = APIRouter()

    @router.get("/api/strategies/golden-cross")
    def golden_cross():
        closes = {}
        for sym in universe():
            try:
                closes[sym] = load_daily(sym)["close"]
            except Exception:          # missing/short history: skip the symbol, don't fail the scan
                continue
        nifty = load_daily(index_symbol)["close"]
        return c2_scan(closes, nifty, held=load_held() if load_held else ())

    return router
