// Shared "explain this stock" modal, used by scanner.js and chat.js.
// Expects an element #explainModal with the structure built by ensureExplainModal().

function ensureExplainModal() {
  if (document.getElementById("explainModal")) return;
  const div = document.createElement("div");
  div.id = "explainModal";
  div.className = "modal hidden";
  div.innerHTML = `
    <div class="modal-box explain-box">
      <div class="explain-head">
        <h3 id="explainSymbol">--</h3>
        <span class="grade-pill" id="explainGrade"></span>
      </div>
      <p id="explainNarrative" class="muted">Loading...</p>
      <div class="chip-row" id="explainFactors"></div>
      <div class="modal-actions"><button id="explainCloseBtn" class="ghost-btn">Close</button></div>
    </div>
  `;
  document.body.appendChild(div);
  document.getElementById("explainCloseBtn").addEventListener("click", () => {
    div.classList.add("hidden");
  });
  div.addEventListener("click", (e) => {
    if (e.target === div) div.classList.add("hidden");
  });
}

function gradeClassFor(grade) {
  if (!grade) return "";
  if (grade.startsWith("A")) return "g-a";
  if (grade.startsWith("B")) return "g-b";
  if (grade === "C") return "g-c";
  return "g-d";
}

async function showExplain(symbol) {
  ensureExplainModal();
  const modal = document.getElementById("explainModal");
  document.getElementById("explainSymbol").textContent = symbol;
  document.getElementById("explainGrade").textContent = "";
  document.getElementById("explainGrade").className = "grade-pill";
  document.getElementById("explainNarrative").textContent = "Loading...";
  document.getElementById("explainFactors").innerHTML = "";
  modal.classList.remove("hidden");

  const res = await fetch(`/api/explain/${encodeURIComponent(symbol)}`);
  const data = await res.json();

  if (!data.available) {
    document.getElementById("explainNarrative").textContent = data.reason || "No explanation available.";
    return;
  }

  document.getElementById("explainGrade").textContent = data.grade || "--";
  document.getElementById("explainGrade").className = `grade-pill ${gradeClassFor(data.grade)}`;
  document.getElementById("explainNarrative").textContent = data.narrative;
  document.getElementById("explainFactors").innerHTML = (data.keyFactors || [])
    .map((f) => `<span class="alert-chip factor-${f.tone}">${f.label}</span>`)
    .join("");
}
