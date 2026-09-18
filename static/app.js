const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.detail || body.message || `Erro ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body.data;
}

const statusLabel = {
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const transportLabel = {
  L: "Buscar e entregar",
  B: "Buscar",
  E: "Tutor leva e entrega",
  C: "Tutor leva e busca",
  D: "Atendimento domicílio",
  S: "Entregar",
};

function fmtTime(dt) {
  if (!dt) return "";
  return dt.slice(11, 16);
}

function pinModal({ title, subtitle, onOk }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open";
    overlay.innerHTML = `
      <div class="modal">
        <h2>${title}</h2>
        <p>${subtitle}</p>
        <input type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="••••">
        <div class="err"></div>
        <div class="row">
          <button class="cancel">Cancelar</button>
          <button class="ok">Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector("input");
    const errEl = overlay.querySelector(".err");
    const close = (value) => {
      overlay.remove();
      resolve(value);
    };
    input.focus();
    const submit = async () => {
      const pin = input.value.trim();
      if (pin.length < 4) {
        errEl.textContent = "PIN deve ter 4 a 6 dígitos";
        return;
      }
      try {
        const result = await onOk(pin);
        close(result);
      } catch (e) {
        errEl.textContent = e.message;
        input.value = "";
        input.focus();
      }
    };
    overlay.querySelector(".ok").onclick = submit;
    overlay.querySelector(".cancel").onclick = () => close(null);
    input.onkeydown = (e) => { if (e.key === "Enter") submit(); };
  });
}

function cardHTML(item) {
  const services = (item.services || [])
    .map((s) => escapeHtml(s.nom_prod_serv || `#${s.cod_prod_serv}`))
    .join(" · ");
  const transport = item.tip_transporte ? transportLabel[item.tip_transporte] : "";
  let actions = "";
  if (item.status === "aguardando") {
    actions = `<button class="btn btn-checkin" data-action="checkin" data-event="${item.cod_evento}" data-pet="${item.nom_animal}">Chegou</button>`;
  } else if (item.status === "presente") {
    actions = `<button class="btn btn-claim" data-action="claim" data-event="${item.cod_evento}" data-pet="${item.nom_animal}">Pegar</button>`;
  }
  const obsParts = [];
  if (item.obs_estetica) obsParts.push(`<div class="obs">${escapeHtml(item.obs_estetica)}</div>`);
  if (item.obs_animal) obsParts.push(`<div class="obs animal">${escapeHtml(item.obs_animal)}</div>`);
  const obs = obsParts.join("");
  const attendant = item.attendant_nome
    ? `<div class="attendant">${escapeHtml(item.attendant_nome)}</div>`
    : "";
  const statusLabel = { aguardando: "Aguardando", presente: "Chegou", em_atendimento: "Em atendimento", concluido: "Concluído" };
  const statusText = statusLabel[item.status] || item.status;
  const time = `<div class="time">${fmtTime(item.dat_evento)}${transport ? ` · ${transport}` : ""}</div>`;

  return `
    <div class="card ${item.status}">
      <div class="card-top">
        <div>
          <div class="pet">${escapeHtml(item.nom_animal || "Pet")}</div>
          <div class="meta">${escapeHtml(item.nom_cliente || "")}</div>
        </div>
        <span class="status ${item.status}"><span class="dot"></span>${statusText}</span>
      </div>
      ${services ? `<div class="services">${services}</div>` : ""}
      ${time}
      ${obs}
      ${attendant}
      ${actions ? `<div class="actions">${actions}</div>` : ""}
    </div>`;
}

function escapeHtml(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

let lastQueue = [];
let searchQuery = "";

function render(queue) {
  lastQueue = queue;
  const buckets = { aguardando: [], presente: [], em_atendimento: [], concluido: [] };
  const q = searchQuery.toLowerCase();
  queue.forEach((item) => {
    if (q) {
      const hay = `${item.nom_animal || ""} ${item.nom_cliente || ""}`.toLowerCase();
      if (!hay.includes(q)) return;
    }
    if (buckets[item.status]) buckets[item.status].push(item);
  });
  const anyMatch = queue.some((item) => {
    if (!q) return true;
    return `${item.nom_animal || ""} ${item.nom_cliente || ""}`.toLowerCase().includes(q);
  });
  if (q && !anyMatch) {
    $("#board-search-note").style.display = "block";
  } else {
    $("#board-search-note").style.display = "none";
  }
  Object.entries(buckets).forEach(([status, items]) => {
    const container = $(`.col-${status} .cards`);
    const count = $(`.col-${status} .count`);
    count.textContent = items.length;
    container.innerHTML = items.length
      ? items.map(cardHTML).join("")
      : `<div class="empty">Nenhum pet aqui</div>`;
  });
  bindActions();
}

function bindActions() {
  $$("[data-action]").forEach((btn) => {
    btn.onclick = () => {
      const { action, event, pet } = btn.dataset;
      if (action === "claim") {
        pinModal({
          title: "Pegar atendimento",
          subtitle: `Informe seu PIN para pegar ${pet}.`,
          onOk: (pin) => api(`/api/queue/${event}/claim`, {
            method: "POST", body: JSON.stringify({ pin }),
          }),
        }).then(() => loadQueue());
      } else if (action === "checkin") {
        api(`/api/queue/${event}/checkin`, {
          method: "POST", body: "{}",
        })
          .then(() => toast(`${pet} marcado como presente.`))
          .catch((e) => toast(e.message))
          .then(() => loadQueue());
      }
    };
  });
}

function toast(message) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 4000);
}

let lastSync = null;

async function loadQueue() {
  try {
    const data = await api("/api/queue");
    render(data);
    lastSync = new Date();
    $("#sync-status").textContent = `Última atualização: ${lastSync.toLocaleTimeString("pt-BR")}`;
  } catch (e) {
    $("#sync-status").textContent = `Erro ao carregar fila: ${e.message}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#board-search").addEventListener("input", () => {
    searchQuery = $("#board-search").value.trim();
    render(lastQueue);
  });
  $("#finish-now").onclick = () => {
    pinModal({
      title: "Finalizar Atendimento",
      subtitle: "Informe seu PIN para finalizar o atendimento em andamento.",
      onOk: (pin) => api("/api/queue/finish", {
        method: "POST", body: JSON.stringify({ pin }),
      }),
    }).then((result) => {
      if (result) {
        toast(`Atendimento de ${result.pet} finalizado por ${result.attendant}`);
      }
      loadQueue();
    });
  };
  $("#sync-now").onclick = async () => {
    $("#sync-status").textContent = "Sincronizando...";
    try {
      const r = await api("/api/sync", { method: "POST", body: "{}" });
      $("#sync-status").textContent = `Sincronizado: ${r.total} evento(s) (${r.removidos} removidos)`;
      loadQueue();
    } catch (e) {
      $("#sync-status").textContent = `Erro: ${e.message}`;
    }
  };
  loadQueue();
  setInterval(loadQueue, 10000);
});