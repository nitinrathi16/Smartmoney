let allResults = [];
let allSectors = [];
let currentSort = "smart_money_score";
let currentDir = "desc";

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
    return true;
  });
}

function sortRows(rows, sortBy, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av = a[sortBy];
    let bv = b[sortBy];
    if (sortBy === "volume_spike") { av = av ? 1 : 0; bv = bv ? 1 : 0; }
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
    tbody.innerHTML = `<tr class="empty-row"><td colspan="15">No stocks match these filters.</td></tr>`;
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
      <td>${alerts}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- data loading ----------

async function loadScanner() {
  const res = await fetch("/api/scanner");
  const data = await res.json();

  allResults = data.results;
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

document.getElementById("alertsFeed").addEventListener("click", (e) => {
  const el = e.target.closest(".alert-symbol[data-symbol]");
  if (el) showExplain(el.dataset.symbol);
});

loadScanner();
loadAlerts();
setInterval(loadScanner, 60000);
setInterval(loadAlerts, 60000);
