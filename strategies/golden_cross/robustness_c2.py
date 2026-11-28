"""Neighbourhood + cost test for the frozen C2 rules."""
import pandas as pd
import backtest as b

n, f = b.load_data()
P = {"in_sample": ("2010-01-01", "2019-12-31"), "out_of_sample": ("2020-01-01", str(n.index[-1].date()))}
rows = []
for slots in (10, 15, 20, 25, 30):
    for fast, slow in ((20, 100), (50, 150), (50, 200), (100, 200)):
        for slope in (False, True):
            for pn, (A, B) in P.items():
                r = b.run(b.preset("V0", max_positions=slots, fast=fast, slow=slow, use_slope=slope), n, f, A, B)
                m = b.metrics(r.equity, r.trades)
                rows.append(dict(period=pn, slots=slots, sma=f"{fast}/{slow}", slope_filter=slope,
                                 cagr=m["cagr"], max_dd=m["max_dd"], sharpe=m["sharpe"], calmar=m["calmar"],
                                 trades=m["trades"], profit_factor=m["profit_factor"]))
g = pd.DataFrame(rows)
g.to_csv("results/robustness_C2.csv", index=False)
for pn in P:
    x = g[g.period == pn]
    print(pn, "combos", len(x), "| CAGR median %.3f min %.3f max %.3f | MaxDD median %.3f worst %.3f | Sharpe median %.2f | PF<1.5: %d"
          % (x.cagr.median(), x.cagr.min(), x.cagr.max(), x.max_dd.median(), x.max_dd.min(), x.sharpe.median(), (x.profit_factor < 1.5).sum()))
    print(x.pivot_table(index="slots", columns="sma", values="cagr", aggfunc="mean").round(3).to_string())
# cost stress and full period for the frozen rule
for cost in (0.0015, 0.0025):
    r = b.run(b.preset("V0", max_positions=20, cost=cost), n, f, "2010-01-01", str(n.index[-1].date()))
    m = b.metrics(r.equity, r.trades, r.exposure)
    print("full period, cost/side", cost, {k: round(float(v), 3) for k, v in m.items() if k != "final"})
    if cost == 0.0015:
        r.trades.to_csv("results/trades_C2.csv", index=False)
        r.equity.to_csv("results/equity_C2_full.csv")
        print("yearly", b.yearly(r.equity).round(3).to_dict())
        print("top-5 trades share of PnL", round(r.trades.nlargest(5, "pnl").pnl.sum() / r.trades.pnl.sum(), 2))
        print(r.trades.nlargest(5, "pnl")[["sym", "entry_date", "exit_date", "ret"]].round(2).to_string(index=False))
