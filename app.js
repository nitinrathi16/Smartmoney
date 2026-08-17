const fmtCr = (n) => (n == null ? "--" : `${n >= 0 ? "+" : ""}${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`);
const fmtPrice = (n) => (n == null ? "--" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

// Chart.js draws to canvas, which can't resolve CSS custom properties, so
// the validated dark-mode palette (dataviz skill references/palette.md) is
// mirrored here as literal hex.
const PALETTE = {
  accent: "#3987e5",
  accent2: "#d95926",
  good: "#0ca30c",
  critical: "#e66767",
  textMuted: "#898781",
  gridline: "#2c2c2a",
};

let fiiDiiChart, ocCharts = {};

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setBadge(source, status) {
  const el = document.querySelector(`.badge[data-src="${source}"]`);
  if (!el || !status) return;
  if (status.ok) {
    el.textContent = `live · ${timeAgo(status.fetched_at)}`;
    el.className = "badge ok";
  } else if (status.stale) {
    el.textContent = `stale · ${timeAgo(status.fetched_at)}`;
    el.className = "badge stale";
    el.title = status.message || "";
  } else {
    el.textContent = "blocked";
    el.className = "badge blocked";
    el.title = status.message || "";
  }
}

function timeAgo(ts) {
  if (!ts) return "n/a";
  const s = Math.round(Date.now() / 1000 - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function renderIndices(block) {
  setBadge("index_quotes", block.status);
  const row = document.getElementById("indexRow");
  row.innerHTML = "";
  const symbols = ["NIFTY", "BANKNIFTY", "INDIA VIX"];
  for (const sym of symbols) {
    const q = block.data[sym];
    const div = document.createElement("div");
    div.className = "index-tile";
    if (!q) {
      div.innerHTML = `<span class="name">${sym}</span><span class="price">--</span>`;
    } else {
      const ltp = q.last_price;
      const prevClose = q.ohlc?.close;
      const chg = prevClose ? ltp - prevClose : null;
      const chgPct = prevClose ? (chg / prevClose) * 100 : null;
      const cls = chg == null ? "" : chg >= 0 ? "pos" : "neg";
      div.innerHTML = `
        <span class="name">${sym}</span>
        <span class="price">${fmtPrice(ltp)}</span>
        <span class="chg ${cls}">${chg == null ? "" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)} (${chgPct.toFixed(2)}%)`}</span>
      `;
    }
    row.appendChild(div);
  }
}

function renderRisk(risk) {
  document.getElementById("riskLabel").textContent = `${risk.label} (${risk.score}/100)`;
  document.getElementById("riskFill").style.left = `${risk.score}%`;
  const ul = document.getElementById("riskReasons");
  ul.innerHTML = "";
  for (const r of risk.reasons) {
    const li = document.createElement("li");
    li.textContent = r;
    ul.appendChild(li);
  }
  if (!risk.reasons.length) {
    const li = document.createElement("li");
    li.textContent = "Waiting on data...";
    ul.appendChild(li);
  }
}

function renderFiiDii(block) {
  setBadge("fiiDii", block.status);
  const summary = block.summary;
  if (!summary || !summary.latest) return;

  const fiiEl = document.getElementById("fiiNet");
  const diiEl = document.getElementById("diiNet");
  const cumEl = document.getElementById("cumNet");

  fiiEl.textContent = fmtCr(summary.latest.fii);
  fiiEl.className = "value " + (summary.latest.fii >= 0 ? "pos" : "neg");
  diiEl.textContent = fmtCr(summary.latest.dii);
  diiEl.className = "value " + (summary.latest.dii >= 0 ? "pos" : "neg");
  const cum = summary.series[summary.series.length - 1]?.cumulative;
  cumEl.textContent = fmtCr(cum);
  cumEl.className = "value " + (cum >= 0 ? "pos" : "neg");

  const labels = summary.series.map((d) => d.date);
  const fiiData = summary.series.map((d) => Math.round(d.fii));
  const diiData = summary.series.map((d) => Math.round(d.dii));

  const ctx = document.getElementById("fiiDiiChart");
  if (!fiiDiiChart) {
    fiiDiiChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [
        { label: "FII", data: fiiData, backgroundColor: PALETTE.accent, borderRadius: 3 },
        { label: "DII", data: diiData, backgroundColor: PALETTE.accent2, borderRadius: 3 },
      ]},
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: PALETTE.textMuted, boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: PALETTE.textMuted, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: PALETTE.textMuted, font: { size: 10 } }, grid: { color: PALETTE.gridline } },
        },
      },
    });
  } else {
    fiiDiiChart.data.labels = labels;
    fiiDiiChart.data.datasets[0].data = fiiData;
    fiiDiiChart.data.datasets[1].data = diiData;
    fiiDiiChart.update();
  }
}

function renderOptionChain(symbol, block) {
  setBadge(`optionChains.${symbol}`, block.status);
  const m = block.metrics;
  document.getElementById(`oc-${symbol}-spot`).textContent = m ? fmtPrice(m.underlying) : "--";
  document.getElementById(`oc-${symbol}-pcr`).textContent = m ? m.pcr ?? "--" : "--";
  document.getElementById(`oc-${symbol}-maxpain`).textContent = m ? m.maxPain ?? "--" : "--";
  document.getElementById(`oc-${symbol}-expiry`).textContent = m?.expiry ? `expiry ${m.expiry}` : "";
  if (!m) return;

  const strikeSet = new Set([...(m.topCallBuildup || []).map((s) => s.strike), ...(m.topPutBuildup || []).map((s) => s.strike)]);
  const strikes = [...strikeSet].sort((a, b) => a - b);
  const callMap = Object.fromEntries((m.topCallBuildup || []).map((s) => [s.strike, s.callOIChange]));
  const putMap = Object.fromEntries((m.topPutBuildup || []).map((s) => [s.strike, s.putOIChange]));

  const ctx = document.getElementById(`oc-${symbol}-chart`);
  const datasets = [
    { label: "Call OI Δ", data: strikes.map((s) => callMap[s] || 0), backgroundColor: PALETTE.critical, borderRadius: 3 },
    { label: "Put OI Δ", data: strikes.map((s) => putMap[s] || 0), backgroundColor: PALETTE.good, borderRadius: 3 },
  ];
  if (!ocCharts[symbol]) {
    ocCharts[symbol] = new Chart(ctx, {
      type: "bar",
      data: { labels: strikes, datasets },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: PALETTE.textMuted, boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: PALETTE.textMuted, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: PALETTE.textMuted, font: { size: 10 } }, grid: { color: PALETTE.gridline } },
        },
      },
    });
  } else {
    ocCharts[symbol].data.labels = strikes;
    ocCharts[symbol].data.datasets = datasets;
    ocCharts[symbol].update();
  }
}

async function loadDashboard() {
  const res = await fetch("/api/dashboard");
  const data = await res.json();

  document.getElementById("dhanWarning").classList.toggle("hidden", data.dhanConfigured);

  renderIndices(data.indices);
  renderRisk(data.risk);
  renderFiiDii(data.fiiDii);
  renderOptionChain("NIFTY", data.optionChains.NIFTY);
  renderOptionChain("BANKNIFTY", data.optionChains.BANKNIFTY);

  const marketEl = document.getElementById("marketStatus");
  marketEl.textContent = data.marketOpen ? "Market open (IST)" : "Market closed (IST)";
  marketEl.style.color = data.marketOpen ? PALETTE.good : "";

  document.getElementById("lastUpdated").textContent = `updated ${new Date().toLocaleTimeString()}`;
}

document.getElementById("refreshBtn").addEventListener("click", async () => {
  await fetch("/api/refresh", { method: "POST" });
  loadDashboard();
});

loadDashboard();
setInterval(loadDashboard, 60000);
