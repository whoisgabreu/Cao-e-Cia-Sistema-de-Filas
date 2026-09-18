const $ = (sel) => document.querySelector(sel);

let lastQueue = [];
let pin = "";
let keypadMode = null; // 'pegar' | 'finalizar'
let confirmData = null;
let currentPin = "";
let filaOpen = false;
let feedbackTimer = null;
let prevPresente = null; // Set de cod_evento presentes (para notificar novas chegadas)
let arriveTimer = null;

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (e) {
    throw new Error("Erro de conexão.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof body.detail === "string"
      ? body.detail
      : res.status === 401 ? "PIN incorreto."
      : res.status === 403 ? "Este PIN não pode finalizar este atendimento."
      : `Erro ${res.status}`;
    throw new Error(msg);
  }
  return body.data;
}

function escapeHtml(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function overlaysOpen() {
  return $("#keypad-overlay").classList.contains("open")
    || $("#confirm-overlay").classList.contains("open")
    || $("#feedback-overlay").classList.contains("open");
}

function show(id) { $(id).style.display = "block"; }
function hide(id) { $(id).style.display = "none"; }

function plural(n, singular, pluralWord) {
  return `${n} ${n === 1 ? singular : pluralWord}`;
}

/* ------------------------------------------------------------------
   Render por estado
------------------------------------------------------------------ */
function render(queue) {
  lastQueue = queue;
  const waiting = queue.filter((i) => i.status === "presente")
    .sort((a, b) => (a.checked_in_at || a.dat_evento || "").localeCompare(b.checked_in_at || b.dat_evento || ""));
  const doing = queue.filter((i) => i.status === "em_atendimento");
  const doneToday = queue.filter((i) => i.status === "concluido" && (i.finished_at || "").slice(0, 10) === todayStr()).length;

  $("#c-aguardando").textContent = waiting.length;
  $("#c-em").textContent = doing.length;
  $("#hist-info").textContent = `${doneToday} finalizados hoje`;

  notifyArrivals(waiting);

  hide("#loading-state");
  hide("#error-state");
  hide("#next-pet");
  hide("#empty-state");
  hide("#active-note");
  hide("#btn-finalizar");

  if (waiting.length > 0) {
    const next = waiting[0];
    $("#next-name").textContent = next.nom_animal || "Pet";
    $("#next-service").textContent = (next.services || []).map((s) => s.nom_prod_serv).join(" · ");
    $("#next-tutor").textContent = next.nom_cliente ? `Tutor: ${next.nom_cliente}` : "";
    show("#next-pet");
  }

  if (doing.length > 0) {
    show("#btn-finalizar");
    if (waiting.length === 0) show("#active-note");
  } else if (waiting.length === 0) {
    show("#empty-state");
  }

  if (filaOpen) renderFila(waiting);
}

function renderFila(waiting) {
  $("#ver-fila-wrap").innerHTML = waiting.length
    ? waiting.map((i) => `
        <div class="min-fila-row">
          <span class="min-fila-pet">${escapeHtml(i.nom_animal || "Pet")}</span>
          <span class="min-fila-meta">${escapeHtml(i.nom_cliente || "")}</span>
        </div>`).join("")
    : `<div class="min-fila-empty">Fila vazia.</div>`;
}

function notifyArrivals(waiting) {
  const current = new Set(waiting.map((i) => i.cod_evento));
  if (prevPresente !== null) {
    const arrivals = waiting.filter((i) => !prevPresente.has(i.cod_evento));
    if (arrivals.length) {
      const names = arrivals.map((i) => i.nom_animal || "Pet").join(", ");
      playArrive();
      showArriveToast(names);
    }
  }
  prevPresente = current;
}

function showArriveToast(names) {
  const toastEl = $("#arrive-toast");
  toastEl.textContent = `Novo pet chegou: ${names}`;
  toastEl.classList.add("show");
  clearTimeout(arriveTimer);
  arriveTimer = setTimeout(() => toastEl.classList.remove("show"), 4000);
}

function showError() {
  hide("#loading-state");
  hide("#next-pet");
  hide("#empty-state");
  hide("#btn-finalizar");
  hide("#active-note");
  show("#error-state");
}

async function loadQueue() {
  hide("#error-state");
  show("#loading-state");
  try {
    const data = await api("/api/queue");
    render(data);
  } catch (e) {
    showError();
  }
}

async function refreshQueue() {
  try {
    const data = await api("/api/queue");
    render(data);
  } catch (e) {
    // mantém o estado atual; o próximo ciclo tenta de novo
  }
}

/* ------------------------------------------------------------------
   Keypad
------------------------------------------------------------------ */
function buildKeypad() {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, "del", 0, "ok"];
  $("#keys").innerHTML = keys.map((k) => {
    if (k === "del") return `<button class="min-key" data-key="del">⌫</button>`;
    if (k === "ok") return `<button class="min-key min-key-ok" data-key="ok">OK</button>`;
    return `<button class="min-key" data-key="${k}">${k}</button>`;
  }).join("");
}

function openKeypad(mode) {
  keypadMode = mode;
  pin = "";
  $("#keypad-title").textContent = mode === "pegar" ? "PEGAR PRÓXIMO PET" : "FINALIZAR ATENDIMENTO";
  $("#keypad-err").textContent = "";
  updateDots();
  $("#keypad-overlay").classList.add("open");
}

function closeKeypad() {
  $("#keypad-overlay").classList.remove("open");
  keypadMode = null;
  pin = "";
}

function updateDots() {
  $("#pin-dots").innerHTML = Array.from({ length: 6 }, (_, i) =>
    `<span class="min-dot ${i < pin.length ? "filled" : ""}"></span>`).join("");
}

function submitPin() {
  if (pin.length < 4) return;
  if (keypadMode === "pegar") {
    api("/api/queue/next", { method: "POST", body: JSON.stringify({ pin }) })
      .then((data) => {
        closeKeypad();
        playSuccess();
        showFeedback(`Atendimento de ${data.pet} iniciado`);
        loadQueue();
      })
      .catch((e) => setKeypadError(e.message));
  } else if (keypadMode === "finalizar") {
    api("/api/queue/finish/prepare", { method: "POST", body: JSON.stringify({ pin }) })
      .then((data) => {
        currentPin = pin;
        confirmData = data;
        closeKeypad();
        openConfirm(data);
      })
      .catch((e) => setKeypadError(e.message));
  }
}

function setKeypadError(msg) {
  $("#keypad-err").textContent = msg;
  pin = "";
  updateDots();
}

/* ------------------------------------------------------------------
   Som (toggle persistente + áudios)
------------------------------------------------------------------ */
const arriveSound = new Audio("/static/sound_effects/pet-arrive.mp3");
const successSound = new Audio("/static/sound_effects/success.mp3");
arriveSound.preload = "auto";
successSound.preload = "auto";

let soundEnabled = localStorage.getItem("minimal_sound") !== "off";
let soundPrimed = false;

function primeSounds() {
  if (soundPrimed) return;
  soundPrimed = true;
  [arriveSound, successSound].forEach((sound) => {
    sound.muted = true;
    const p = sound.play();
    if (p && p.then) p.then(() => { sound.pause(); sound.currentTime = 0; sound.muted = false; }).catch(() => {});
  });
}

function playSuccess() {
  if (!soundEnabled) return;
  successSound.currentTime = 0;
  successSound.play().catch(() => {});
}

function playArrive() {
  if (!soundEnabled) return;
  arriveSound.currentTime = 0;
  arriveSound.play().catch(() => {});
}

document.addEventListener("pointerdown", primeSounds, { once: true });
document.addEventListener("touchstart", primeSounds, { once: true });
document.addEventListener("mousedown", primeSounds, { once: true });
document.addEventListener("keydown", primeSounds, { once: true });

document.addEventListener("click", (e) => {
  const keyBtn = e.target.closest(".min-key");
  if (!keyBtn || !keypadMode) return;
  primeSounds();
  const key = keyBtn.dataset.key;
  if (key === "del") {
    pin = pin.slice(0, -1);
    updateDots();
  } else if (key === "ok") {
    submitPin();
  } else if (pin.length < 6) {
    pin += key;
    updateDots();
    if (pin.length === 6) submitPin();
  }
});

/* ------------------------------------------------------------------
   Confirmação de finalização
------------------------------------------------------------------ */
function openConfirm(data) {
  $("#cf-pet").textContent = data.pet || "Pet";
  $("#cf-service").textContent = (data.services || []).join(" · ") || "Sem serviço";
  $("#cf-inicio").textContent = data.claimed_at ? data.claimed_at.slice(0, 16) : "";
  $("#cf-duracao").textContent = data.duracao_min != null
    ? `${Math.max(0, Math.round(data.duracao_min))} minutos`
    : "";
  $("#confirm-overlay").classList.add("open");
}

function closeConfirm() {
  $("#confirm-overlay").classList.remove("open");
  confirmData = null;
  currentPin = "";
}

async function doFinalize() {
  try {
    const data = await api("/api/queue/finish", { method: "POST", body: JSON.stringify({ pin: currentPin }) });
    closeConfirm();
    playSuccess();
    showFeedback(`Atendimento de ${data.pet} finalizado`);
    loadQueue();
  } catch (e) {
    closeConfirm();
    showFeedback(e.message, true);
    loadQueue();
  }
}

/* ------------------------------------------------------------------
   Feedback
------------------------------------------------------------------ */
function showFeedback(message, isError = false) {
  clearTimeout(feedbackTimer);
  const box = $("#feedback-box");
  box.textContent = message;
  box.classList.toggle("error", isError);
  $("#feedback-overlay").classList.add("open");
  feedbackTimer = setTimeout(() => {
    $("#feedback-overlay").classList.remove("open");
  }, 1600);
}

/* ------------------------------------------------------------------
   Inicialização
------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  buildKeypad();

  $("#sound-toggle").checked = soundEnabled;
  $("#sound-toggle").addEventListener("change", (e) => {
    soundEnabled = e.target.checked;
    localStorage.setItem("minimal_sound", soundEnabled ? "on" : "off");
    primeSounds();
  });

  $("#btn-pegar").onclick = () => openKeypad("pegar");
  $("#btn-finalizar").onclick = () => openKeypad("finalizar");
  $("#btn-retry").onclick = loadQueue;

  $("#cf-cancelar").onclick = closeConfirm;
  $("#cf-finalizar").onclick = doFinalize;

  $("#keypad-overlay").addEventListener("click", (e) => {
    if (e.target === $("#keypad-overlay")) closeKeypad();
  });
  $("#confirm-overlay").addEventListener("click", (e) => {
    if (e.target === $("#confirm-overlay")) closeConfirm();
  });

  $("#btn-ver-fila").onclick = () => {
    filaOpen = !filaOpen;
    $("#ver-fila-wrap").style.display = filaOpen ? "block" : "none";
    if (filaOpen) renderFila(lastQueue.filter((i) => i.status === "presente")
      .sort((a, b) => (a.checked_in_at || a.dat_evento || "").localeCompare(b.checked_in_at || b.dat_evento || "")));
  };

  loadQueue();
  setInterval(() => { if (!overlaysOpen()) refreshQueue(); }, 5000);
});