const PALETTE = {
  good: "#0ca30c",
  critical: "#e66767",
  warning: "#fab219",
  textMuted: "#898781",
  gridline: "#2c2c2a",
};

let bucketChart, mlImportanceChart;

function fmtPct(n) {
  return n == null ? "--" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function pnlClass(n) {
  return n == null ? "" : n >= 0 ? "pos" : "neg";
}

function renderBucketChart(buckets) {
  const labels = buckets.map((b) => b.scoreRange).reverse();
  const values = buckets.map((b) => b.fwd_return_20d.meanReturn).reverse();
  const colors = values.map((v) => (v == null ? PALETTE.textMuted : v >= 0 ? PALETTE.good : PALETTE.critical));

  const ctx = document.getElementById("bucketChart");
  if (!bucketChart) {
    bucketChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Avg 20d forward return %", data: values, backgroundColor: colors, borderRadius: 3 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: PALETTE.textMuted, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: PALETTE.textMuted, font: { size: 10 } }, grid: { color: PALETTE.gridline } },
        },
      },
    });
  } else {
    bucketChart.data.labels = labels;
    bucketChart.data.datasets[0].data = values;
    bucketChart.data.datasets[0].backgroundColor = colors;
    bucketChart.update();
  }
}

function renderBucketTable(buckets) {
  const tbody = document.querySelector("#bucketTable tbody");
  tbody.innerHTML = "";
  for (const b of buckets) {
    const tr = document.createElement("tr");
    const d5 = b.fwd_return_5d, d10 = b.fwd_return_10d, d20 = b.fwd_return_20d;
    tr.innerHTML = `
      <td class="symbol-cell">${b.scoreRange}</td>
      <td class="tabular">${b.n}</td>
      <td class="tabular ${pnlClass(d5.meanReturn)}">${fmtPct(d5.meanReturn)}</td>
      <td class="tabular">${d5.winRate == null ? "--" : d5.winRate + "%"}</td>
      <td class="tabular ${pnlClass(d10.meanReturn)}">${fmtPct(d10.meanReturn)}</td>
      <td class="tabular">${d10.winRate == null ? "--" : d10.winRate + "%"}</td>
      <td class="tabular ${pnlClass(d20.meanReturn)}">${fmtPct(d20.meanReturn)}</td>
      <td class="tabular">${d20.winRate == null ? "--" : d20.winRate + "%"}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderGradeTable(grades) {
  const tbody = document.querySelector("#gradeTable tbody");
  tbody.innerHTML = "";
  if (!grades.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No data.</td></tr>`;
    return;
  }
  for (const g of grades) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="grade-pill ${gradeClassFor(g.grade)}">${g.grade}</span></td>
      <td class="tabular">${g.n}</td>
      <td class="tabular ${pnlClass(g.avgReturn5d)}">${fmtPct(g.avgReturn5d)}</td>
      <td class="tabular ${pnlClass(g.avgReturn10d)}">${fmtPct(g.avgReturn10d)}</td>
      <td class="tabular ${pnlClass(g.avgReturn20d)}">${fmtPct(g.avgReturn20d)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function gradeClassFor(grade) {
  if (!grade) return "";
  if (grade.startsWith("A")) return "g-a";
  if (grade.startsWith("B")) return "g-b";
  if (grade === "C") return "g-c";
  return "g-d";
}

function icClass(ic) {
  if (ic == null) return "";
  const a = Math.abs(ic);
  if (a >= 0.1) return ic > 0 ? "pos" : "neg";
  if (a >= 0.05) return "";
  return "";
}

function renderICTable(factors) {
  const tbody = document.querySelector("#icTable tbody");
  tbody.innerHTML = "";
  for (const f of factors) {
    const tr = document.createElement("tr");
    const d5 = f.fwd_return_5d, d10 = f.fwd_return_10d, d20 = f.fwd_return_20d;
    tr.innerHTML = `
      <td class="symbol-cell">${f.factor}</td>
      <td class="tabular ${icClass(d5.ic)}">${d5.ic == null ? "--" : d5.ic.toFixed(3)}</td>
      <td class="tabular ${icClass(d10.ic)}">${d10.ic == null ? "--" : d10.ic.toFixed(3)}</td>
      <td class="tabular ${icClass(d20.ic)}">${d20.ic == null ? "--" : d20.ic.toFixed(3)}</td>
      <td class="tabular">${d20.n}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderCandidateICTable(factors) {
  const tbody = document.querySelector("#candidateICTable tbody");
  tbody.innerHTML = "";
  if (!factors.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No data.</td></tr>`;
    return;
  }
  for (const f of factors) {
    const tr = document.createElement("tr");
    const d5 = f.fwd_return_5d, d10 = f.fwd_return_10d, d20 = f.fwd_return_20d;
    tr.innerHTML = `
      <td class="symbol-cell">${f.factor}</td>
      <td class="tabular ${icClass(d5.ic)}">${d5.ic == null ? "--" : d5.ic.toFixed(3)}</td>
      <td class="tabular ${icClass(d10.ic)}">${d10.ic == null ? "--" : d10.ic.toFixed(3)}</td>
      <td class="tabular ${icClass(d20.ic)}">${d20.ic == null ? "--" : d20.ic.toFixed(3)}</td>
      <td class="tabular">${d20.n}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderSeasonalityTable(seasonality) {
  const tbody = document.querySelector("#seasonalityTable tbody");
  tbody.innerHTML = "";
  const rows = [
    ...seasonality.byDayOfWeek.map((d) => [d.label, d]),
    ["Turn of Month (±3 trading days)", seasonality.turnOfMonth],
    ["Mid-Month", seasonality.midMonth],
  ];
  for (const [label, data] of rows) {
    const tr = document.createElement("tr");
    const d5 = data.fwd_return_5d, d10 = data.fwd_return_10d, d20 = data.fwd_return_20d;
    tr.innerHTML = `
      <td class="symbol-cell">${label}</td>
      <td class="tabular">${d20.n}</td>
      <td class="tabular ${pnlClass(d5.meanReturn)}">${fmtPct(d5.meanReturn)}</td>
      <td class="tabular ${pnlClass(d10.meanReturn)}">${fmtPct(d10.meanReturn)}</td>
      <td class="tabular ${pnlClass(d20.meanReturn)}">${fmtPct(d20.meanReturn)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderSMCTable(smc) {
  const tbody = document.querySelector("#smcTable tbody");
  tbody.innerHTML = "";
  const rows = [
    ["Baseline (all rows)", smc.baseline],
    ["Unfilled Bullish FVG", smc.unfilledBullishFVG],
    ["Unfilled Bearish FVG", smc.unfilledBearishFVG],
    ["Bullish Order Block Retest", smc.bullishOrderBlockRetest],
    ["Bearish Order Block Retest", smc.bearishOrderBlockRetest],
  ];
  for (const [label, data] of rows) {
    const tr = document.createElement("tr");
    const d5 = data.fwd_return_5d, d10 = data.fwd_return_10d, d20 = data.fwd_return_20d;
    tr.innerHTML = `
      <td class="symbol-cell">${label}</td>
      <td class="tabular">${d20.n}</td>
      <td class="tabular ${pnlClass(d5.meanReturn)}">${fmtPct(d5.meanReturn)}</td>
      <td class="tabular ${pnlClass(d10.meanReturn)}">${fmtPct(d10.meanReturn)}</td>
      <td class="tabular ${pnlClass(d20.meanReturn)}">${fmtPct(d20.meanReturn)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderMLModel(ml) {
  if (!ml.trained) {
    document.getElementById("mlVerdict").textContent = ml.reason || "Model not trained yet.";
    return;
  }
  document.getElementById("mlIC").textContent = ml.testInformationCoefficient?.toFixed(4) ?? "--";
  document.getElementById("mlBaselineIC").textContent = ml.baselineInformationCoefficient?.toFixed(4) ?? "--";
  document.getElementById("mlMAE").textContent = ml.testMAE?.toFixed(2) ?? "--";

  const mlIC = ml.testInformationCoefficient, baseIC = ml.baselineInformationCoefficient;
  let verdict;
  if (mlIC == null || baseIC == null) {
    verdict = "Not enough data to compare.";
  } else if (Math.abs(mlIC) < 0.03 && Math.abs(baseIC) < 0.03) {
    verdict = `Neither the ML model nor the rule-based score shows meaningful predictive power on the held-out test set (both ICs near zero) — consistent with the factor analysis above finding no individual factor carries real signal in this window.`;
  } else if (Math.abs(mlIC) > Math.abs(baseIC)) {
    verdict = `ML model shows a stronger (though still ${Math.abs(mlIC) < 0.05 ? "weak" : "moderate"}) relationship with forward returns than the rule-based score on held-out data.`;
  } else {
    verdict = `ML model does not improve on the rule-based score's (weak) predictive power on held-out data.`;
  }
  document.getElementById("mlVerdict").textContent = verdict;

  const labels = Object.keys(ml.featureImportances || {});
  const values = Object.values(ml.featureImportances || {});
  const ctx = document.getElementById("mlImportanceChart");
  if (!mlImportanceChart) {
    mlImportanceChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: "#3987e5", borderRadius: 3 }] },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: PALETTE.textMuted, font: { size: 10 } }, grid: { color: PALETTE.gridline } },
          y: { ticks: { color: PALETTE.textMuted, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
  } else {
    mlImportanceChart.data.labels = labels;
    mlImportanceChart.data.datasets[0].data = values;
    mlImportanceChart.update();
  }
}

async function loadBacktest() {
  const res = await fetch("/api/backtest");
  const data = await res.json();
  const sb = data.scoreBuckets;

  document.getElementById("backtestWarning").classList.toggle("hidden", sb.totalRows > 0);

  document.getElementById("btRows").textContent = sb.totalRows.toLocaleString();
  if (sb.dateRange && sb.dateRange.from) {
    document.getElementById("btRange").textContent = `${sb.dateRange.from} → ${sb.dateRange.to}`;
    document.getElementById("btDates").textContent = sb.dateRange.sampledDates;
  }

  renderBucketChart(sb.buckets);
  renderBucketTable(sb.buckets);
  renderICTable(data.factorIC);
  renderCandidateICTable(data.candidateFactorIC);
  renderSeasonalityTable(data.seasonality);
  renderSMCTable(data.smcSignals);
  renderMLModel(data.mlModel);
  renderGradeTable(data.gradeAnalysis);
}

loadBacktest();
