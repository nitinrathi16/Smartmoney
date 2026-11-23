"""Collect TradingView OHLCV JSON dumps into one CSV per symbol."""
import glob, json, sys, os
import pandas as pd

src, out = sys.argv[1], sys.argv[2]
rows = []
for f in glob.glob(os.path.join(src, "mcp-TradingView_MCP-mcp-tv-get-ohlcv-*.txt")):
    d = json.load(open(f))
    b = d["bars"]
    df = pd.DataFrame({"t": b["t"], "open": b["o"], "high": b["h"], "low": b["l"], "close": b["c"], "volume": b["v"]})
    df["date"] = pd.to_datetime(df["t"], unit="s", utc=True).dt.tz_convert("Asia/Kolkata").dt.date
    df = df.drop(columns="t").drop_duplicates("date").set_index("date").sort_index()
    sym = d["symbol"].split(":")[1]
    df.to_csv(os.path.join(out, f"{sym}.csv"))
    rows.append((sym, len(df), df.index[0], df.index[-1]))
for r in sorted(rows):
    print(*r)
print("total", len(rows))
