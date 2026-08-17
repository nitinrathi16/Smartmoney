const EXAMPLES = [
  "stocks with smart money score > 90",
  "long build-up and high volume",
  "which sectors are strongest today",
  "breakout candidates with low risk",
  "institutional buying in IT",
  "grade A stocks in nifty bank",
];

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

function meterCell(value) {
  if (value == null) return `<td class="score-cell">--</td>`;
  const tone = scoreTone(value);
  const pct = Math.max(0, Math.min(100, value));
  return `<td class="score-cell"><div class="meter ${tone}"><div class="meter-track" style="width:${pct}%"></div><span class="meter-value tabular">${Number(value).toFixed(1)}</span></div></td>`;
}

function renderExamples() {
  const row = document.getElementById("exampleChips");
  row.innerHTML = "";
  for (const ex of EXAMPLES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "example-chip";
    chip.textContent = ex;
    chip.addEventListener("click", () => {
      document.getElementById("chatInput").value = "";
      submitQuery(ex);
    });
    row.appendChild(chip);
  }
}

function addUserMessage(text) {
  const log = document.getElementById("chatLog");
  const empty = log.querySelector(".chat-empty");
  if (empty) empty.remove();
  const bubble = document.createElement("div");
  bubble.className = "chat-msg chat-msg-user";
  bubble.textContent = text;
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
}

function addAssistantBlock(data) {
  const log = document.getElementById("chatLog");
  const block = document.createElement("div");
  block.className = "chat-msg chat-msg-assistant";

  if (data.type === "unrecognized") {
    const chipsHtml = data.suggestions.map((s) => `<button type="button" class="example-chip" data-q="${s}">${s}</button>`).join("");
    block.innerHTML = `
      <p>I didn't recognize that. I understand phrasings like:</p>
      <div class="chip-row">${chipsHtml}</div>
    `;
    block.querySelectorAll(".example-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const q = chip.dataset.q;
        document.getElementById("chatInput").value = "";
        submitQuery(q);
      });
    });
    log.appendChild(block);
    log.scrollTop = log.scrollHeight;
    return;
  }

  const understoodHtml = (data.understood || []).map((u) => `<span class="alert-chip">${u}</span>`).join("");

  if (data.type === "sectors") {
    const rows = data.results
      .map(
        (s, i) => `<tr><td class="serial tabular">${i + 1}</td><td class="symbol-cell">${s.sector}</td>${meterCell(s.avgSmartMoneyScore)}<td class="tabular">${s.count}</td></tr>`
      )
      .join("");
    block.innerHTML = `
      <p>Understood: ${understoodHtml || "<span class=\"muted\">(sector ranking)</span>"}</p>
      <div class="table-scroll" style="max-height:none;">
        <table><thead><tr><th>#</th><th>Sector</th><th>Avg Smart Money</th><th>Stocks</th></tr></thead>
        <tbody>${rows || '<tr class="empty-row"><td colspan="4">No data yet.</td></tr>'}</tbody></table>
      </div>
    `;
    log.appendChild(block);
    log.scrollTop = log.scrollHeight;
    return;
  }

  // type === "stocks"
  const results = data.results || [];
  const rows = results
    .slice(0, 100)
    .map((r, i) => {
      const alerts = (r.alerts || []).map((a) => `<span class="alert-chip">${a}</span>`).join("");
      return `<tr>
        <td class="serial tabular">${i + 1}</td>
        <td class="symbol-cell clickable" data-symbol="${r.symbol}">${r.symbol}</td>
        <td>${r.sector || "--"}</td>
        ${meterCell(r.smart_money_score)}
        <td><span class="grade-pill ${gradeClass(r.trade_quality_grade)}">${r.trade_quality_grade || "--"}</span></td>
        <td>${r.oi_buildup || "--"}</td>
        <td class="tabular">${r.delivery_pct == null ? "--" : r.delivery_pct}</td>
        <td>${alerts}</td>
      </tr>`;
    })
    .join("");

  block.innerHTML = `
    <p>Understood: ${understoodHtml || "<span class=\"muted\">(no filters recognized, showing all)</span>"}</p>
    <p class="muted">${results.length} match${results.length === 1 ? "" : "es"} out of ${data.totalScanned ?? "?"} scanned${results.length > 100 ? " (showing top 100)" : ""}</p>
    <div class="table-scroll" style="max-height:420px;">
      <table><thead><tr><th>#</th><th>Stock</th><th>Sector</th><th>Smart Money</th><th>Grade</th><th>OI Buildup</th><th>Delivery %</th><th>Alerts</th></tr></thead>
      <tbody>${rows || '<tr class="empty-row"><td colspan="8">No matches.</td></tr>'}</tbody></table>
    </div>
  `;
  log.appendChild(block);
  log.scrollTop = log.scrollHeight;
}

async function submitQuery(text) {
  if (!text.trim()) return;
  addUserMessage(text);
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: text }),
  });
  const data = await res.json();
  addAssistantBlock(data);
}

function submitFromInput() {
  const input = document.getElementById("chatInput");
  const text = input.value;
  input.value = "";
  submitQuery(text);
}

document.getElementById("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  submitFromInput();
});

// Belt-and-suspenders: some automation/IME input paths don't reliably
// trigger the form's implicit submit-on-Enter, so handle it explicitly too.
document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitFromInput();
  }
});

document.getElementById("chatLog").addEventListener("click", (e) => {
  const cell = e.target.closest(".symbol-cell[data-symbol]");
  if (cell) showExplain(cell.dataset.symbol);
});

renderExamples();
