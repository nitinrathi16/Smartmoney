const PALETTE = {
  accent: "#3987e5",
  accent2: "#d95926",
  accent3: "#1baf7a",
  accent4: "#eda100",
  accent5: "#e87ba4",
  accent6: "#9085e9",
  good: "#0ca30c",
  critical: "#e66767",
  textMuted: "#898781",
  gridline: "#2c2c2a",
};
const SECTOR_COLORS = [PALETTE.accent, PALETTE.accent2, PALETTE.accent3, PALETTE.accent4, PALETTE.accent5, PALETTE.accent6, PALETTE.good, PALETTE.critical];

const fmtRupee = (n) => (n == null ? "--" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const fmtPct = (n) => (n == null ? "--" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`);
const pnlClass = (n) => (n == null ? "" : n >= 0 ? "pos" : "neg");

let sectorChart;

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

function renderSummary(summary) {
  const pnlEl = document.getElementById("pPnl");
  const dayPnlEl = document.getElementById("pDayPnl");

  document.getElementById("pInvested").textContent = fmtRupee(summary.totalInvested);
  document.getElementById("pCurrent").textContent = fmtRupee(summary.totalCurrentValue);

  pnlEl.textContent = `${fmtRupee(summary.totalPnl)} (${fmtPct(summary.totalPnlPct)})`;
  pnlEl.className = "value tabular " + pnlClass(summary.totalPnl);

  dayPnlEl.textContent = fmtRupee(summary.totalDayPnl);
  dayPnlEl.className = "value tabular " + pnlClass(summary.totalDayPnl);
}

function renderFunds(funds) {
  document.getElementById("fAvail").textContent = fmtRupee(funds.availableBalance);
  document.getElementById("fUtilized").textContent = fmtRupee(funds.utilizedAmount);
  document.getElementById("fWithdraw").textContent = fmtRupee(funds.withdrawableBalance);
  document.getElementById("fCollateral").textContent = fmtRupee(funds.collateralAmount);
}

function renderConcentration(summary) {
  document.getElementById("cHoldings").textContent = summary.holdingsCount ?? "--";
  document.getElementById("cWinLoss").textContent = `${summary.winners ?? 0} / ${summary.losers ?? 0}`;
  document.getElementById("cLargest").textContent = summary.largestPositionPct != null ? `${summary.largestPositionPct}%` : "--";
}

function renderSectorChart(allocation) {
  const ctx = document.getElementById("sectorChart");
  const labels = (allocation || []).map((s) => s.sector);
  const values = (allocation || []).map((s) => s.pct);
  const colors = labels.map((_, i) => SECTOR_COLORS[i % SECTOR_COLORS.length]);

  if (!sectorChart) {
    sectorChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "% of portfolio", data: values, backgroundColor: colors, borderRadius: 3 }] },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: PALETTE.textMuted, font: { size: 10 } }, grid: { color: PALETTE.gridline } },
          y: { ticks: { color: PALETTE.textMuted, font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  } else {
    sectorChart.data.labels = labels;
    sectorChart.data.datasets[0].data = values;
    sectorChart.data.datasets[0].backgroundColor = colors;
    sectorChart.update();
  }
}

function renderHoldings(holdings, totalCurrentValue) {
  const tbody = document.querySelector("#holdingsTable tbody");
  tbody.innerHTML = "";
  if (!holdings.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="12">No holdings found.</td></tr>`;
    return;
  }
  const sorted = [...holdings].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
  sorted.forEach((h, i) => {
    const weight = totalCurrentValue ? ((h.currentValue || 0) / totalCurrentValue * 100).toFixed(1) : "--";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="serial tabular">${i + 1}</td>
      <td class="symbol-cell">${h.symbol}</td>
      <td>${h.sector || "Other"}</td>
      <td class="tabular">${h.qty}</td>
      <td class="tabular">${fmtRupee(h.avgCost)}</td>
      <td class="tabular">${fmtRupee(h.ltp)}</td>
      <td class="tabular ${pnlClass(h.dayChangePct)}">${fmtPct(h.dayChangePct)}</td>
      <td class="tabular">${fmtRupee(h.investedValue)}</td>
      <td class="tabular">${fmtRupee(h.currentValue)}</td>
      <td class="tabular ${pnlClass(h.pnl)}">${fmtRupee(h.pnl)}</td>
      <td class="tabular ${pnlClass(h.pnlPct)}">${fmtPct(h.pnlPct)}</td>
      <td class="tabular">${weight}%</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPositions(positions) {
  const tbody = document.querySelector("#positionsTable tbody");
  tbody.innerHTML = "";
  if (!positions.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No open positions.</td></tr>`;
    return;
  }
  for (const p of positions) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="symbol-cell">${p.symbol}</td>
      <td>${p.exchangeSegment || "--"}</td>
      <td>${p.productType || "--"}</td>
      <td>${p.positionType || "--"}</td>
      <td class="tabular">${p.netQty ?? "--"}</td>
      <td class="tabular">${fmtRupee(p.buyAvg)}</td>
      <td class="tabular">${fmtRupee(p.sellAvg)}</td>
      <td class="tabular ${pnlClass(p.realizedProfit)}">${fmtRupee(p.realizedProfit)}</td>
      <td class="tabular ${pnlClass(p.unrealizedProfit)}">${fmtRupee(p.unrealizedProfit)}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function loadPortfolio() {
  const res = await fetch("/api/portfolio");
  const data = await res.json();

  document.getElementById("dhanWarning").classList.toggle("hidden", data.dhanConfigured);
  setBadge("portfolio", data.status);

  renderSummary(data.summary);
  renderFunds(data.funds);
  renderConcentration(data.summary);
  renderSectorChart(data.summary.sectorAllocation);
  renderHoldings(data.holdings, data.summary.totalCurrentValue);
  renderPositions(data.positions);

  const marketEl = document.getElementById("marketStatus");
  marketEl.textContent = data.marketOpen ? "Market open (IST)" : "Market closed (IST)";
  marketEl.style.color = data.marketOpen ? PALETTE.good : "";

  document.getElementById("lastUpdated").textContent = `updated ${new Date().toLocaleTimeString()}`;
}

function hhiLabel(hhi) {
  if (hhi == null) return "--";
  if (hhi < 1500) return `${hhi} (low)`;
  if (hhi < 2500) return `${hhi} (moderate)`;
  return `${hhi} (high)`;
}

function renderPortfolioOptimization(po) {
  if (!po.available) {
    document.getElementById("poCorr").textContent = "--";
    document.getElementById("poHHI").textContent = po.reason || "--";
    return;
  }
  document.getElementById("poCorr").textContent = po.avgPairwiseCorrelation ?? "--";
  document.getElementById("poHHI").textContent = hhiLabel(po.herfindahlIndex);

  const pairsBody = document.querySelector("#corrPairsTable tbody");
  pairsBody.innerHTML = "";
  for (const p of po.topCorrelatedPairs || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="symbol-cell">${p.a}</td><td class="symbol-cell">${p.b}</td><td class="tabular">${p.correlation}</td>`;
    pairsBody.appendChild(tr);
  }

  const rebalBody = document.querySelector("#rebalanceTable tbody");
  rebalBody.innerHTML = "";
  for (const pos of po.positions || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="symbol-cell">${pos.symbol}</td>
      <td class="tabular">${pos.currentWeight}%</td>
      <td class="tabular">${pos.annualizedVolPct == null ? "--" : pos.annualizedVolPct + "%"}</td>
      <td class="tabular">${pos.suggestedWeight == null ? "--" : pos.suggestedWeight + "%"}</td>
      <td class="tabular ${pos.deltaPct == null ? "" : pos.deltaPct > 0 ? "neg" : "pos"}">${pos.deltaPct == null ? "--" : (pos.deltaPct > 0 ? "+" : "") + pos.deltaPct + "%"}</td>
    `;
    rebalBody.appendChild(tr);
  }
}

async function loadPortfolioOptimization() {
  const res = await fetch("/api/portfolio/optimization");
  const data = await res.json();
  renderPortfolioOptimization(data);
}

document.getElementById("refreshBtn").addEventListener("click", async () => {
  await fetch("/api/portfolio/refresh", { method: "POST" });
  loadPortfolio();
});

loadPortfolio();
loadPortfolioOptimization();
setInterval(loadPortfolio, 15000);
