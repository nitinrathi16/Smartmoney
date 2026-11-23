"""In-sample (2010-2019) candidate search. Out-of-sample data is NOT touched here."""
import pandas as pd
import backtest as b

n, f = b.load_data()
A, B = "2010-01-01", "2019-12-31"
C = {
 "V0 baseline":                 b.preset("V0"),
 "V2 draft":                    b.preset("V2"),
 "C1 V0 + exit<SMA200":         b.preset("V0", exit_below_slow=True),
 "C2 V0 20 slots":              b.preset("V0", max_positions=20),
 "C3 cross20+slope, wide ATR":  b.preset("V2", entry_mode="cross", use_regime=False, stop_atr=3, trail_atr=5,
                                         use_below_fast=False, sizing="equal"),
 "C4 C3 + regime":              b.preset("V2", entry_mode="cross", use_regime=True, stop_atr=3, trail_atr=5,
                                         use_below_fast=False, sizing="equal"),
 "C5 C3 + 1% risk sizing":      b.preset("V2", entry_mode="cross", use_regime=False, stop_atr=3, trail_atr=5,
                                         use_below_fast=False, sizing="risk"),
 "C6 V2 relaxed (no vol, wide)":b.preset("V2", vol_mult=0, rsi_hi=80, stop_atr=3, trail_atr=5,
                                         use_below_fast=False, use_regime=False, sizing="equal"),
}
rows = []
for k, p in C.items():
    r = b.run(p, n, f, A, B)
    m = b.metrics(r.equity, r.trades, r.exposure)
    rows.append(dict(candidate=k, **{x: m.get(x) for x in
        ("cagr", "max_dd", "sharpe", "calmar", "trades", "win_rate", "profit_factor", "avg_days", "time_in_market")}))
for name, s in (("NIFTY B&H", b.nifty_bh(n, A, B, 1e6)), ("Universe EW", b.universe_ew(f, n, A, B, 1e6))):
    rows.append(dict(candidate=name, **b.metrics(s)))
df = pd.DataFrame(rows)
df.to_csv("results/in_sample_candidates.csv", index=False)
pd.set_option("display.width", 250)
print(df.drop(columns=[c for c in ("final",) if c in df]).round(3).to_string(index=False))
