"""Single out-of-sample run (2020 -> latest) of the candidates frozen after the in-sample search."""
import pandas as pd
import backtest as b
from index_timing import index_timing

n, f = b.load_data()
A, B = "2020-01-01", str(n.index[-1].date())
rows = []
for name, p in (("V0 baseline", b.preset("V0")),
                ("C2 frozen: V0 20 slots", b.preset("V0", max_positions=20))):
    r = b.run(p, n, f, A, B)
    rows.append(dict(candidate=name, **b.metrics(r.equity, r.trades, r.exposure)))
    r.equity.to_csv(f"results/oos_equity_{name.split()[0]}.csv")
for cy in (0.0, 0.06):
    eq, sw, tim = index_timing(n, A, B, cash_yield=cy)
    rows.append(dict(candidate=f"NIFTY GC timing (cash {cy:.0%})", **b.metrics(eq), trades=sw, time_in_market=tim))
rows.append(dict(candidate="NIFTY B&H", **b.metrics(b.nifty_bh(n, A, B, 1e6))))
rows.append(dict(candidate="Universe EW", **b.metrics(b.universe_ew(f, n, A, B, 1e6))))
df = pd.DataFrame(rows)
df.to_csv("results/out_of_sample_frozen.csv", index=False)
pd.set_option("display.width", 250)
print(df[["candidate","cagr","max_dd","sharpe","calmar","trades","win_rate","profit_factor","time_in_market"]].round(3).to_string(index=False))
