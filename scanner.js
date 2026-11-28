let allResults = [];
let allSectors = [];
let currentSort = "smart_money_score";
let currentDir = "desc";
let gcBySymbol = {};   // C2 Golden Cross state per symbol, from /api/strategies/golden-cross
const GC_ORDER = { BUY: 0, WATCH: 1, HOLD: 2, SELL: 3, AVOID: 4 };
const GC_HELP = {
  BUY: "Golden cross at last close: buy at next open (C2)",
  SELL: "Death cross at last close: sell at next open (C2)",
  HOLD: "SMA50 above SMA200: in a golden-cross trend",
  WATCH: "SMA50 within 1% below SMA200 and closing in",
  AVOID: "SMA50 below SMA200",
};

function scoreTone(v) {
  if (v == null) return "";
  if (v >= 65) return "tone-good";
  if (v >= 45) return "tone-warn";
  return "tone-bad";
}

function gradeClass(grade) {
  if (!grade) return "";
  if (grade.startsWith("A")) return "g-a";
  if (grade.startsWith("B")) return "g-b";
  if (grade === "C") return "g-c";
  return "g-d";
}

function fmtNum(n, digits = 1) {
  return n == null ? "--" : Number(n).toFixed(digits);
}

function meterCell(value, { invert = false } = {}) {
  if (value == null) return `<td class="score-cell">--</td>`;
  const tone = scoreTone(invert ? 100 - value : value);
  const pct = Math.max(0, Math.min(100, value));
  return `<td class="score-cell">
    <div class="meter ${tone}">
      <div class="meter-track" style="width:${pct}%"></div>
      <span class="meter-value tabular">${fmtNum(value)}</span>
    </div>
  </td>`;
}

// ---------- filtering / sorting ----------

function getFilters() {
  return {
    indexName: document.getElementById("f-index").value,
    search: document.getElementById("f-search").value.trim().toUpperCase(),
    sector: document.getElementById("f-sector").value,
    grade: document.getElementById("f-grade").value,
    oi: document.getElementById("f-oi").value,
    volSpike: document.getElementById("f-volspike").value,
    minSms: parseFloat(document.getElementById("f-sms").value) || null,
    minMomentum: parseFloat(document.getElementById("f-momentum").value) || null,
    minBreakout: parseFloat(document.getElementById("f-breakout").value) || null,
    minSwing: parseFloat(document.getElementById("f-swing").value) || null,
    minOptOpp: parseFloat(document.getElementById("f-optopp").value) || null,
    maxRisk: document.getElementById("f-risk").value === "" ? null : parseFloat(document.getElementById("f-risk").value),
    minDelivery: parseFloat(document.getElementById("f-delivery").value) || null,
    gc: document.getElementById("f-gc").value,
  };
}

function applyFilters(rows, f) {
  return rows.filter((r) => {
    if (f.indexName && f.indexName !== "ALL" && !(r.indices || []).includes(f.indexName)) return false;
    if (f.search && !r.symbol.toUpperCase().includes(f.search)) return false;
    if (f.sector && r.sector !== f.sector) return false;
    if (f.grade && r.trade_quality_grade !== f.grade) return false;
    if (f.oi && r.oi_buildup !== f.oi) return false;
    if (f.volSpike === "yes" && !r.volume_spike) return false;
    if (f.minSms != null && (r.smart_money_score == null || r.smart_money_score < f.minSms)) return false;
    if (f.minMomentum != null && (r.momentum_score == null || r.momentum_score < f.minMomentum)) return false;
    if (f.minBreakout != null && (r.breakout_probability == null || r.breakout_probability < f.minBreakout)) return false;
    if (f.minSwing != null && (r.swing_score == null || r.swing_score < f.minSwing)) return false;
    if (f.minOptOpp != null && (r.option_opportunity_score == null || r.option_opportunity_score < f.minOptOpp)) return false;
    if (f.maxRisk != null && (r.risk_score == null || r.risk_score > f.maxRisk)) return false;
    if (f.minDelivery != null && (r.delivery_pct == null || r.delivery_pct < f.minDelivery)) return false;
    if (f.gc && r.gc_state !== f.gc) return false;
    return true;
  });
}

function sortRows(rows, sortBy, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av = a[sortBy];
    let bv = b[sortBy];
    if (sortBy === "volume_spike") { av = av ? 1 : 0; bv = bv ? 1 : 0; }
    // gc_state: "desc" (default click) puts BUY first
    if (sortBy === "gc_state") {
      av = av == null ? null : -GC_ORDER[av];
      bv = bv == null ? null : -GC_ORDER[bv];
    }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") return av.localeCompare(bv) * mul;
    return (av - bv) * mul;
  });
}

function updateSortIndicators() {
  document.querySelectorAll("#scannerTable th[data-sort]").forEach((th) => {
    th.classList.toggle("sorted", th.dataset.sort === currentSort);
    const arrow = th.dataset.sort === currentSort ? (currentDir === "asc" ? " ↑" : " ↓") : "";
    th.dataset.label = th.dataset.label || th.textContent.replace(/ [↑↓]$/, "");
    th.textContent = th.dataset.label + arrow;
  });
}

function render() {
  const filters = getFilters();
  const filtered = sortRows(applyFilters(allResults, filters), currentSort, currentDir);

  document.getElementById("resultCount").textContent = `${filtered.length} of ${allResults.length} shown`;
  updateSortIndicators();

  const tbody = document.querySelector("#scannerTable tbody");
  tbody.innerHTML = "";

  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="16">No stocks match these filters.</td></tr>`;
    return;
  }

  filtered.forEach((r, i) => {
    const tr = document.createElement("tr");
    const alerts = (r.alerts || []).map((a) => `<span class="alert-chip">${a}</span>`).join("");
    tr.innerHTML = `
      <td class="serial tabular">${i + 1}</td>
      <td class="symbol-cell clickable" data-symbol="${r.symbol}">${r.symbol}</td>
      <td>${r.sector || "--"}</td>
      <td class="tabular ${r.change_pct == null ? "" : r.change_pct >= 0 ? "pos" : "neg"}">${r.change_pct == null ? "--" : r.change_pct.toFixed(2) + "%"}</td>
      ${meterCell(r.smart_money_score)}
      ${meterCell(r.momentum_score)}
      ${meterCell(r.breakout_probability)}
      ${meterCell(r.swing_score)}
      ${meterCell(r.option_opportunity_score)}
      ${meterCell(r.risk_score, { invert: true })}
      <td><span class="grade-pill ${gradeClass(r.trade_quality_grade)}">${r.trade_quality_grade || "--"}</span></td>
      <td>${r.volume_spike ? '<span class="dot-flag">●</span>' : ""}</td>
      <td>${r.oi_buildup || "--"}</td>
      <td class="tabular">${r.delivery_pct == null ? "--" : r.delivery_pct}</td>
      <td>${gcPill(r)}</td>
      <td>${alerts}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- golden cross (C2) ----------

function gcPill(r) {
  if (!r.gc_state) return "--";
  const d = r.gc_days_since_cross;
  const days = r.gc_state === "BUY" || r.gc_state === "SELL" ? "today" : d == null ? "" : `${d}d`;
  const tip = `${GC_HELP[r.gc_state]} · SMA50/200 gap ${r.gc_spread_pct ?? "--"}%`
    + (r.gc_rs_6m_pct == null ? "" : ` · 6m vs NIFTY ${r.gc_rs_6m_pct}%`);
  return `<span class="gc-pill gc-${r.gc_state}" title="${tip}">${r.gc_state}<span class="gc-days">${days}</span></span>`;
}

function gcChip(r, extra = "") {
  return `<span class="gc-pill gc-${r.gc_state} clickable" data-symbol="${r.symbol}" title="${GC_HELP[r.gc_state]}">${r.symbol}${extra}</span>`;
}

async function loadGoldenCross() {
  const box = document.getElementById("gcSignals");
  let data;
  try {
    const res = await fetch("/api/strategies/golden-cross");
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    gcBySymbol = {};
    box.innerHTML = `<span class="muted">Golden cross endpoint not connected (/api/strategies/golden-cross). See strategies/golden_cross/live_signals.py.</span>`;
    return;
  }
  gcBySymbol = Object.fromEntries(data.results.map((r) => [r.symbol, r]));
  document.getElementById("gcAsOf").textContent =
    `signals at close ${data.asOf || "--"} · act at next open · ${data.freeSlots}/${data.slots} slots free`;

  const watch = data.results.filter((r) => r.gc_state === "WATCH");
  const holdCount = data.results.filter((r) => r.gc_state === "HOLD").length;
  const buys = data.buys.map((r) => gcChip(r, r.gc_take ? "" : " (no slot)")).join("");
  const sells = data.sells.map((r) => gcChip(r)).join("");
  box.innerHTML = `
    <div class="gc-group"><span class="gc-group-title">Buy at next open</span>
      <div class="gc-list">${buys || '<span class="muted">No golden cross today</span>'}</div></div>
    <div class="gc-group"><span class="gc-group-title">Sell at next open</span>
      <div class="gc-list">${sells || '<span class="muted">No death cross today</span>'}</div></div>
    <div class="gc-group"><span class="gc-group-title">Watch · near cross</span>
      <div class="gc-list">${watch.map((r) => gcChip(r, ` ${r.gc_spread_pct}%`)).join("") || '<span class="muted">None</span>'}</div></div>
    <div class="gc-group"><span class="gc-group-title">In uptrend (HOLD)</span>
      <span class="tabular">${holdCount} stocks</span></div>
  `;
}

function mergeGoldenCross(rows) {
  return rows.map((r) => ({ ...r, ...(gcBySymbol[r.symbol] ? stripSymbol(gcBySymbol[r.symbol]) : {}) }));
}

function stripSymbol({ symbol, ...rest }) {
  return rest;
}

// ---------- data loading ----------

async function loadScanner() {
  const [res] = await Promise.all([fetch("/api/scanner"), loadGoldenCross()]);
  const data = await res.json();

  allResults = mergeGoldenCross(data.results);
  allSectors = data.sectors;

  const sectorSelect = document.getElementById("f-sector");
  if (sectorSelect.options.length <= 1) {
    for (const s of allSectors) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sectorSelect.appendChild(opt);
    }
  }

  const indexSelect = document.getElementById("f-index");
  if (indexSelect.options.length === 0) {
    for (const idx of data.indices) {
      const opt = document.createElement("option");
      opt.value = idx.value;
      opt.textContent = idx.label;
      indexSelect.appendChild(opt);
    }
  }

  const marketEl = document.getElementById("marketStatus");
  marketEl.textContent = data.marketOpen ? "Market open (IST)" : "Market closed (IST)";
  marketEl.style.color = data.marketOpen ? "var(--good)" : "";

  const anyConfigured = data.results.some((r) => r.ltp != null);
  document.getElementById("scanWarning").classList.toggle("hidden", anyConfigured || data.results.length === 0);
  document.getElementById("lastUpdated").textContent = `updated ${new Date().toLocaleTimeString()}`;

  render();
}

// ---------- events ----------

document.querySelectorAll("#scannerTable th[data-sort]").forEach((th) => {
  th.dataset.label = th.textContent;
  th.addEventListener("click", () => {
    if (currentSort === th.dataset.sort) {
      currentDir = currentDir === "asc" ? "desc" : "asc";
    } else {
      currentSort = th.dataset.sort;
      currentDir = "desc";
    }
    render();
  });
});

document.querySelectorAll(".slicer-bar input, .slicer-bar select").forEach((el) => {
  el.addEventListener("input", render);
});

document.getElementById("clearFiltersBtn").addEventListener("click", () => {
  document.querySelectorAll(".slicer-bar input").forEach((el) => (el.value = ""));
  document.querySelectorAll(".slicer-bar select").forEach((el) => {
    if (el.id !== "f-index") el.value = "";
  });
  document.getElementById("f-index").value = "NIFTY500";
  render();
});

document.getElementById("refreshBtn").addEventListener("click", async (e) => {
  const btn = e.target;
  btn.disabled = true;
  btn.textContent = "Scanning...";
  await fetch("/api/scanner/run", { method: "POST" });
  await loadScanner();
  btn.disabled = false;
  btn.textContent = "Run Scan";
});

document.querySelector("#scannerTable tbody").addEventListener("click", (e) => {
  const cell = e.target.closest(".symbol-cell[data-symbol]");
  if (cell) showExplain(cell.dataset.symbol);
});

function alertTimeStr(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function loadAlerts() {
  const res = await fetch("/api/alerts?limit=20");
  const data = await res.json();
  const feed = document.getElementById("alertsFeed");
  feed.innerHTML = "";
  if (!data.alerts.length) {
    feed.innerHTML = `<span class="muted">No alerts fired yet.</span>`;
    return;
  }
  for (const a of data.alerts) {
    const row = document.createElement("div");
    row.className = `alert-row alert-severity-${a.severity}`;
    row.innerHTML = `
      <span class="alert-severity-dot"></span>
      <span class="alert-time">${alertTimeStr(a.created_at)}</span>
      <span class="alert-symbol" data-symbol="${a.symbol}">${a.symbol}</span>
      <span>${a.message.replace(a.symbol + ": ", "")}</span>
    `;
    feed.appendChild(row);
  }
}

document.getElementById("gcSignals").addEventListener("click", (e) => {
  const el = e.target.closest("[data-symbol]");
  if (el) showExplain(el.dataset.symbol);
});

document.getElementById("alertsFeed").addEventListener("click", (e) => {
  const el = e.target.closest(".alert-symbol[data-symbol]");
  if (el) showExplain(el.dataset.symbol);
});

loadScanner();
loadAlerts();
setInterval(loadScanner, 60000);
setInterval(loadAlerts, 60000);
