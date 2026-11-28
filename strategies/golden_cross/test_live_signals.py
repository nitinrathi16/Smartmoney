"""Live C2 signals must fire on exactly the days the backtest saw crosses.
Run: python3 test_live_signals.py   (needs data/*.csv; skips otherwise)"""
import os, random, sys
import pandas as pd
import backtest as b
from live_signals import c2_state, c2_scan

if not os.path.exists(os.path.join(b.DATA, "NIFTY.csv")):
    print("SKIP: no data/"); sys.exit(0)
nifty, frames = b.load_data()
p = b.preset("V0")
random.seed(0)
checked = mismatches = 0
for sym in random.sample(sorted(frames), 15):
    df = frames[sym]
    ind = b.indicators(df, p)
    days = list(ind.index[ind.gc | ind.dc]) + random.sample(list(ind.index[250:]), 40)
    for d in days:
        st = c2_state(df.close.loc[:d])
        exp = "BUY" if ind.gc[d] else "SELL" if ind.dc[d] else None
        got = st["gc_state"] if st else None
        ok = (got == exp) if exp else got not in ("BUY", "SELL")
        checked += 1
        if not ok:
            mismatches += 1
            print("MISMATCH", sym, d.date(), exp, got)
print(f"checked {checked} symbol-days, mismatches {mismatches}")
# snapshot as of the last completed bar
scan = c2_scan({s: f.close for s, f in frames.items()}, nifty.close)
print("as of", scan["asOf"], "| BUY:", [(r["symbol"], r["gc_rs_6m_pct"]) for r in scan["buys"]],
      "| SELL:", [r["symbol"] for r in scan["sells"]])
print("counts", pd.Series([r["gc_state"] for r in scan["results"]]).value_counts().to_dict())
print("WATCH:", [(r["symbol"], r["gc_spread_pct"]) for r in scan["results"] if r["gc_state"] == "WATCH"])
sys.exit(1 if mismatches else 0)
