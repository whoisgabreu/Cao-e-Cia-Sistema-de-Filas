/* Tela simples do atendente (tablet) — usa helpers de /static/ui.js */
const { api, icon, escapeHtml, todayStr, avatar, fmtLocalTime, plural, titleCase, notes, infoModal } = UI;

let lastQueue = [];
let pin = "";
let keypadBusy = false;
let keypadMode = null; // 'pegar' | 'finalizar'
let confirmData = null;
let currentPin = "";
let finalizing = false;
let filaOpen = false;
let feedbackTimer = null;
let prevPresente = null; // Set de cod_evento presentes (para notificar novas chegadas)
let arriveTimer = null;
let nextItem = null; // próximo pet exibido no hero
let heroSig = "";    // assinatura do hero (evita re-render desnecessário)
let pegarTarget = null; // cod_evento do pet que o atendente confirmou pegar

function overlaysOpen() {
  return $("#keypad-overlay").classList.contains("open")
    || $("#confirm-overlay").classList.contains("open")
    || $("#feedback-overlay").classList.contains("open");
}

function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }

function sortWaiting(list) {
  return list.sort((a, b) => {
    const pa = a.is_prioridade ? 0 : 1;
    const pb = b.is_prioridade ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (a.checked_in_at || a.dat_evento || "").localeCompare(b.checked_in_at || b.dat_evento || "");
  });
}

function prioChip(item) {
  if (!(item.is_prioridade || /prioridade/i.test(item.obs_estetica || ""))) return "";
  return `<span class="chip prioridade">${icon("star")}<span>Prioridade</span></span>`;
}

/* ------------------------------------------------------------------
   Render por estado
------------------------------------------------------------------ */
function render(queue) {
  lastQueue = queue;
  const waiting = sortWaiting(queue.filter((i) => i.status === "presente"));
  const doing = queue.filter((i) => i.status === "em_atendimento");
  const doneToday = queue.filter((i) => i.status === "concluido" && (i.finished_at || "").slice(0, 10) === todayStr()).length;

  $("#c-aguardando").textContent = waiting.length;
  $("#c-em").textContent = doing.length;
  $("#hist-info").textContent = `${plural(doneToday, "finalizado", "finalizados")} hoje`;

  notifyArrivals(waiting);

  hide("#loading-state");
  hide("#error-state");
  hide("#next-pet");
  hide("#empty-state");
  hide("#active-note");
  hide("#btn-finalizar");

  nextItem = waiting[0] || null;
  if (nextItem) {
    const next = nextItem;
    const sig = `${next.cod_evento}|${next.nom_animal}|${next.nom_cliente}|`
      + `${(next.services || []).map((s) => s.nom_prod_serv).join(",")}|${prioChip(next) ? 1 : 0}`;
    if (sig !== heroSig) {
      heroSig = sig;
      $("#next-avatar").innerHTML = avatar(next.nom_animal, "xl");
      $("#next-name").textContent = titleCase(next.nom_animal) || "Pet";
      $("#next-service").innerHTML = (prioChip(next) + (next.services || [])
        .map((s) => `<span class="chip service">${icon("scissors")}<span>${escapeHtml(titleCase(s.nom_prod_serv))}</span></span>`).join(""));
      $("#next-tutor").innerHTML = next.nom_cliente ? `${icon("user")}<span>${escapeHtml(titleCase(next.nom_cliente))}</span>` : "";
    }
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
  UI.reconcileList(
    $("#ver-fila-wrap"),
    waiting,
    (i) => i.cod_evento,
    (i, idx) => `
        <div class="queue-row">
          <span class="queue-pos">${idx + 1}</span>
          ${avatar(i.nom_animal, "sm")}
          <div class="queue-text">
            <div class="queue-pet">${escapeHtml(titleCase(i.nom_animal) || "Pet")}</div>
            <div class="queue-meta">${escapeHtml(titleCase(i.nom_cliente))}</div>
          </div>
          ${prioChip(i)}
        </div>`,
    () => `<div class="queue-empty">Fila vazia.</div>`
  );
}

function showEmAtendimento() {
  const doing = lastQueue.filter((i) => i.status === "em_atendimento");
  const rows = doing.map((i) => `
      <div class="confirm-row">
        <span>${icon("user")}<span>${escapeHtml(titleCase(i.attendant_nome) || "—")}</span></span>
        <span><b>${escapeHtml(titleCase(i.nom_animal) || "Pet")}</b></span>
      </div>`).join("");
  const body = doing.length
    ? `<div class="confirm-rows">${rows}</div>`
    : `<div class="note">${icon("info")}<span>Nenhum atendimento em andamento.</span></div>`;
  infoModal({
    title: "Em atendimento",
    subtitle: `${doing.length} em andamento`,
    iconName: "scissors",
    tone: "teal",
    bodyHTML: body,
    okLabel: "Fechar",
  });
}

function notifyArrivals(waiting) {
  const current = new Set(waiting.map((i) => i.cod_evento));
  if (prevPresente !== null) {
    const arrivals = waiting.filter((i) => !prevPresente.has(i.cod_evento));
    if (arrivals.length) {
      const names = arrivals.map((i) => titleCase(i.nom_animal) || "Pet").join(", ");
      playArrive();
      showArriveToast(names);
    }
  }
  prevPresente = current;
}

function showArriveToast(names) {
  const toastEl = $("#arrive-toast");
  toastEl.innerHTML = `${icon("bell")}<span>Novo pet chegou: <b>${escapeHtml(names)}</b></span>`;
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
    if (k === "del") return `<button type="button" class="key del" data-key="del" aria-label="Apagar">${icon("backspace")}</button>`;
    if (k === "ok") return `<button type="button" class="key ok" data-key="ok" aria-label="Confirmar">${icon("check")}</button>`;
    return `<button type="button" class="key" data-key="${k}">${k}</button>`;
  }).join("");
}

function openKeypad(mode) {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  keypadMode = mode;
  keypadBusy = false;
  pin = "";
  if (mode === "pegar") pegarTarget = nextItem ? nextItem.cod_evento : null;
  const pegar = mode === "pegar";
  $("#keypad-title").textContent = pegar ? "Atender pet" : "Encerrar atendimento";
  $("#keypad-sub").textContent = "Digite seu PIN";
  $("#keypad-icon").className = `modal-icon ${pegar ? "green" : "teal"}`;
  $("#keypad-icon").innerHTML = icon(pegar ? "paw" : "checkCircle");
  $("#keypad-err").textContent = "";
  updateDots();
  $("#keypad-overlay").classList.add("open");
}

function closeKeypad() {
  $("#keypad-overlay").classList.remove("open");
  $("#keypad-overlay .modal").classList.remove("busy");
  keypadMode = null;
  keypadBusy = false;
  pin = "";
}

// 4 bolinhas no mínimo (PIN de 4 dígitos fica "completo"), cresce até 6.
function updateDots() {
  const shown = Math.max(4, Math.min(6, pin.length));
  $("#pin-dots").innerHTML = Array.from({ length: shown }, (_, i) =>
    `<span class="pin-dot ${i < pin.length ? "filled" : ""}"></span>`).join("");
  $("#keys .key.ok").classList.toggle("ready", pin.length >= 4);
}

function setKeypadBusy(on) {
  keypadBusy = on;
  $("#keypad-overlay .modal").classList.toggle("busy", on);
}

function submitPin() {
  if (keypadBusy) return;
  if (pin.length < 4) { setKeypadError("PIN deve ter 4 a 6 dígitos"); return; }
  setKeypadBusy(true);
  if (keypadMode === "pegar") {
    api("/api/queue/next", { method: "POST", body: JSON.stringify({ pin }) })
      .then((data) => {
        closeKeypad();
        playSuccess();
        loadQueue();
        if (data.cod_evento !== pegarTarget && (data.obs_estetica || data.obs_animal)) {
          // A fila é atômica: outro atendente pegou o pet confirmado e veio o seguinte
          infoModal({
            title: `Você pegou ${titleCase(data.pet)}`,
            subtitle: "Outro atendente pegou o pet anterior. Leia as observações deste antes de começar.",
            bodyHTML: notes(data),
            okLabel: "Entendi, começar o banho",
            tone: "amber",
            iconName: "alert",
          });
        } else {
          showFeedback(`Atendimento de ${titleCase(data.pet)} iniciado`);
        }
      })
      .catch((e) => { setKeypadBusy(false); setKeypadError(e.message); });
  } else if (keypadMode === "finalizar") {
    api("/api/queue/finish/prepare", { method: "POST", body: JSON.stringify({ pin }) })
      .then((data) => {
        currentPin = pin;
        confirmData = data;
        closeKeypad();
        openConfirm(data);
      })
      .catch((e) => { setKeypadBusy(false); setKeypadError(e.message); });
  }
}

function setKeypadError(msg) {
  $("#keypad-err").textContent = msg;
  pin = "";
  updateDots();
  const dots = $("#pin-dots");
  dots.classList.remove("shake");
  void dots.offsetWidth;
  dots.classList.add("shake");
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
  const keyBtn = e.target.closest(".key");
  if (!keyBtn || !keypadMode) return;
  keyBtn.blur();
  if (keypadBusy) return;
  primeSounds();
  const key = keyBtn.dataset.key;
  if (key === "del") {
    pin = pin.slice(0, -1);
    updateDots();
  } else if (key === "ok") {
    submitPin();
  } else if (pin.length < 6) {
    pin += key;
    $("#keypad-err").textContent = "";
    updateDots();
  }
});

// Teclado físico (quando houver)
document.addEventListener("keydown", (e) => {
  if (!keypadMode) return;
  if (e.key === "Escape") { closeKeypad(); return; }
  if (keypadBusy) return;
  if (e.key.length === 1 && e.key >= "0" && e.key <= "9") {
    e.preventDefault();
    if (pin.length < 6) { $("#keypad-err").textContent = ""; pin += e.key; updateDots(); }
  } else if (e.key === "Backspace") { e.preventDefault(); pin = pin.slice(0, -1); updateDots(); }
  else if (e.key === "Enter") { e.preventDefault(); submitPin(); }
  else if (e.key === " ") { e.preventDefault(); }
});

/* ------------------------------------------------------------------
   Confirmação de finalização
------------------------------------------------------------------ */
function openConfirm(data) {
  $("#cf-pet").textContent = titleCase(data.pet) || "Pet";
  $("#cf-service").textContent = (data.services || []).map(titleCase).join(" · ") || "Sem serviço";
  $("#cf-inicio").textContent = data.claimed_at ? fmtLocalTime(data.claimed_at) : "";
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
  if (finalizing) return;
  finalizing = true;
  const btn = $("#cf-finalizar");
  if (btn) btn.disabled = true;
  try {
    const data = await api("/api/queue/finish", { method: "POST", body: JSON.stringify({ pin: currentPin }) });
    closeConfirm();
    playSuccess();
    showFeedback(`${titleCase(data.pet)} está pronto!`);
    loadQueue();
  } catch (e) {
    closeConfirm();
    showFeedback(e.message, true);
    loadQueue();
  } finally {
    finalizing = false;
    if (btn) btn.disabled = false;
  }
}

/* ------------------------------------------------------------------
   Feedback
------------------------------------------------------------------ */
function showFeedback(message, isError = false) {
  clearTimeout(feedbackTimer);
  const box = $("#feedback-box");
  box.innerHTML = `${icon(isError ? "alert" : "checkCircle")}<span>${escapeHtml(message)}</span>`;
  box.classList.toggle("error", isError);
  $("#feedback-overlay").classList.add("open");
  feedbackTimer = setTimeout(() => {
    $("#feedback-overlay").classList.remove("open");
  }, 1800);
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

  $("#btn-pegar").onclick = async () => {
    const item = nextItem;
    if (item && (item.obs_estetica || item.obs_animal)) {
      const ok = await infoModal({
        title: `Atenção: ${titleCase(item.nom_animal) || "Pet"}`,
        subtitle: "Leia as observações antes de pegar este pet.",
        bodyHTML: notes(item),
        okLabel: "OK, continuar",
        cancelLabel: "Cancelar",
        tone: "amber",
        iconName: "alert",
      });
      if (!ok) return;
    }
    openKeypad("pegar");
  };
  $("#btn-finalizar").onclick = () => openKeypad("finalizar");
  $("#btn-retry").onclick = loadQueue;
  $("#btn-refresh").onclick = () => window.location.reload();
  $("#keypad-cancel").onclick = closeKeypad;

  $("#cf-cancelar").onclick = closeConfirm;
  $("#cf-finalizar").onclick = doFinalize;

  $("#keypad-overlay").addEventListener("click", (e) => {
    if (e.target === $("#keypad-overlay")) closeKeypad();
  });
  $("#confirm-overlay").addEventListener("click", (e) => {
    if (e.target === $("#confirm-overlay")) closeConfirm();
  });

  $("#btn-em-atendimento").onclick = showEmAtendimento;

  $("#btn-ver-fila").onclick = () => {
    filaOpen = !filaOpen;
    $("#ver-fila-wrap").classList.toggle("hidden", !filaOpen);
    $("#btn-ver-fila").innerHTML = `${icon(filaOpen ? "chevronDown" : "list")}${filaOpen ? "Ocultar fila" : "Ver fila"}`;
    if (filaOpen) renderFila(sortWaiting(lastQueue.filter((i) => i.status === "presente")));
  };

  loadQueue();
  UI.connectQueueStream(() => { if (!overlaysOpen()) refreshQueue(); });
});
