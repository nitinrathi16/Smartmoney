"""Golden cross timing on the NIFTY 50 index itself (no survivorship bias).
In the index when SMA50 > SMA200 (signal at close, trade next open), else in cash.
cash_yield = annual return earned while in cash (0 or a liquid-fund proxy)."""
import numpy as np, pandas as pd
import backtest as b

def index_timing(nifty, start, end, fast=50, slow=200, cost=0.0015, cash_yield=0.0, capital=1e6):
    c, o = nifty.close, nifty.open
    sig = (c.rolling(fast).mean() > c.rolling(slow).mean()).astype(int)
    held = sig.shift(1).fillna(0)                     # position during day t decided at t-1 close
    # return while held: overnight + intraday from open entry; approximate with close-to-close,
    # but entry/exit days use the open price
    r_cc = c.pct_change().fillna(0)
    r_entry = c / o - 1                               # first day: open -> close
    r_exit = o / c.shift() - 1                        # exit day: prev close -> open
    enter = (held == 1) & (held.shift(1, fill_value=0) == 0)
    leave = (held == 0) & (held.shift(1, fill_value=0) == 1)
    daily_cash = (1 + cash_yield) ** (1 / 252) - 1
    r = np.where(enter, r_entry - cost, np.where(held == 1, r_cc, daily_cash))
    r = np.where(leave, r_exit - cost, r)
    r = pd.Series(r, index=c.index).loc[start:end]
    eq = capital * (1 + r).cumprod()
    switches = int((enter | leave).loc[start:end].sum())
    return eq, switches, held.loc[start:end].mean()

if __name__ == "__main__":
    n, f = b.load_data()
    for A, B in (("2010-01-01", "2019-12-31"),):
        for cy in (0.0, 0.06):
            eq, sw, tim = index_timing(n, A, B, cash_yield=cy)
            m = b.metrics(eq)
            print(A[:4], B[:4], "cash_yield", cy, {k: round(v, 3) for k, v in m.items() if k != "final"}, "switches", sw, "time_in", round(tim, 2))
        print("  NIFTY B&H", {k: round(v, 3) for k, v in b.metrics(b.nifty_bh(n, A, B, 1e6)).items() if k != "final"})
