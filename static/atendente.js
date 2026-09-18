const $ = (sel) => document.querySelector(sel);
let lastQueue = [];

const transportLabel = {
  L: "Buscar e entregar",
  B: "Buscar",
  E: "Tutor leva e entrega",
  C: "Tutor leva e busca",
  D: "Atendimento domicílio",
  S: "Entregar",
};

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

function escapeHtml(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtTime(dt) {
  if (!dt) return "";
  return dt.slice(11, 16);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    const close = (value) => { overlay.remove(); resolve(value); };
    input.focus();
    const submit = async () => {
      const pin = input.value.trim();
      if (pin.length < 4) { errEl.textContent = "PIN deve ter 4 a 6 dígitos"; return; }
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

function waitingCard(item) {
  const statusText = item.status === "presente" ? "Chegou" : "Aguardando";
  const statusCls = item.status === "presente" ? "presente" : "aguardando";
  const ident = item.num_identificacao
    ? `<div class="tablet-meta">ID ${escapeHtml(item.num_identificacao)}</div>`
    : "";
  return `
    <div class="tablet-card ${item.status}">
      <div class="card-top">
        <div>
          <div class="tablet-pet">${escapeHtml(item.nom_animal || "Pet")}</div>
          <div class="tablet-meta">${escapeHtml(item.nom_cliente || "")}</div>
        </div>
        <span class="status ${statusCls}"><span class="dot"></span>${statusText}</span>
      </div>
      ${ident}
      <div class="tablet-meta">${fmtTime(item.dat_evento)}</div>
      <button class="btn-start" data-event="${item.cod_evento}">Iniciar</button>
    </div>`;
}

function detailModal(item) {
  return new Promise((resolve) => {
    const services = (item.services || [])
      .map((s) => escapeHtml(s.nom_prod_serv || `#${s.cod_prod_serv}`))
      .join(" · ");
    const obsParts = [];
    if (item.obs_estetica) {
      obsParts.push(`<div class="obs-alert">${escapeHtml(item.obs_estetica)}</div>`);
    }
    if (item.obs_animal) {
      obsParts.push(`<div class="obs-alert animal">${escapeHtml(item.obs_animal)}</div>`);
    }
    const ident = item.num_identificacao
      ? `<div class="tablet-meta">ID ${escapeHtml(item.num_identificacao)}</div>`
      : "";
    const transport = item.tip_transporte ? transportLabel[item.tip_transporte] : "";
    const time = item.dat_evento
      ? `<div class="tablet-meta">${fmtTime(item.dat_evento)}${transport ? ` · ${escapeHtml(transport)}` : ""}</div>`
      : "";

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open";
    overlay.innerHTML = `
      <div class="modal modal-detail">
        <h2>${escapeHtml(item.nom_animal || "Pet")}</h2>
        <p class="modal-client">${escapeHtml(item.nom_cliente || "")}</p>
        <div class="modal-body">
          ${time}
          ${ident}
          ${services ? `<div class="services">${services}</div>` : ""}
          ${obsParts.join("")}
        </div>
        <input type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="Seu PIN" class="pin-input">
        <div class="err"></div>
        <div class="row">
          <button class="btn cancel">Cancelar</button>
          <button class="btn btn-primary ok">Confirmar início</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector(".pin-input");
    const errEl = overlay.querySelector(".err");
    const close = (value) => { overlay.remove(); resolve(value); };
    input.focus();
    const submit = async () => {
      const pin = input.value.trim();
      if (pin.length < 4) { errEl.textContent = "PIN deve ter 4 a 6 dígitos"; return; }
      try {
        const result = await api(`/api/queue/${item.cod_evento}/start`, {
          method: "POST", body: JSON.stringify({ pin }),
        });
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

function doingCard(item) {
  return `
    <div class="tablet-card em_atendimento">
      <div class="card-top">
        <div>
          <div class="tablet-pet">${escapeHtml(item.nom_animal || "Pet")}</div>
          <div class="tablet-meta">${escapeHtml(item.nom_cliente || "")}</div>
        </div>
        <span class="status em_atendimento"><span class="dot"></span>Em atendimento</span>
      </div>
      <div class="tablet-meta">${escapeHtml(item.attendant_nome || "")}</div>
    </div>`;
}

function doneRow(item) {
  return `
    <div class="done-row">
      <span class="done-pet">${escapeHtml(item.nom_animal || "Pet")}</span>
      <span class="done-meta">${escapeHtml(item.nom_cliente || "")} · ${escapeHtml(item.attendant_nome || "")}</span>
    </div>`;
}

function render(queue) {
  lastQueue = queue;
  const waiting = queue.filter((i) => i.status === "presente")
    .sort((a, b) => (a.checked_in_at || a.dat_evento || "").localeCompare(b.checked_in_at || b.dat_evento || ""));
  const doing = queue.filter((i) => i.status === "em_atendimento");
  const done = queue.filter((i) => i.status === "concluido" && (i.finished_at || "").slice(0, 10) === todayStr());

  $("#c-aguardando").textContent = waiting.length;
  $("#c-em_atendimento").textContent = doing.length;
  $("#c-concluido").textContent = done.length;

  const query = ($("#search").value || "").trim().toLowerCase();
  const filtered = query
    ? waiting.filter((i) =>
        [i.nom_animal, i.nom_cliente, i.num_identificacao]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query)))
    : waiting;

  $("#waiting").innerHTML = filtered.length
    ? filtered.map(waitingCard).join("")
    : `<div class="empty">${query ? "Nenhum pet encontrado." : "Nenhum pet aguardando."}</div>`;

  $("#doing").innerHTML = doing.length
    ? doing.map(doingCard).join("")
    : `<div class="empty">Nenhum atendimento em andamento.</div>`;

  $("#done").innerHTML = done.length
    ? done.map(doneRow).join("")
    : `<div class="empty">Nenhum pet finalizado hoje.</div>`;

  bindWaiting();
}

function bindWaiting() {
  document.querySelectorAll(".btn-start").forEach((btn) => {
    btn.onclick = () => {
      const event = Number(btn.dataset.event);
      const item = lastQueue.find((i) => i.cod_evento === event);
      if (!item) { toast("Pet não encontrado."); return; }
      detailModal(item).then((result) => {
        if (result) toast(`Atendimento de ${item.nom_animal} iniciado`);
        loadQueue();
      });
    };
  });
}

function startNext() {
  const first = lastQueue
    .filter((i) => i.status === "aguardando" || i.status === "presente")
    .sort((a, b) => (a.dat_evento || "").localeCompare(b.dat_evento || ""))[0];
  if (!first) {
    toast("Nenhum pet aguardando.");
    return;
  }
  detailModal(first).then((result) => {
    if (result) toast(`Atendimento de ${first.nom_animal} iniciado`);
    loadQueue();
  });
}

async function loadQueue() {
  try {
    const data = await api("/api/queue");
    render(data);
    $("#sync-status").textContent = `Atualizado: ${new Date().toLocaleTimeString("pt-BR")}`;
  } catch (e) {
    $("#sync-status").textContent = `Erro: ${e.message}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-next").onclick = startNext;
  $("#btn-finish").onclick = () => {
    pinModal({
      title: "Finalizar Atendimento",
      subtitle: "Informe seu PIN para finalizar o atendimento em andamento.",
      onOk: (pin) => api("/api/queue/finish", {
        method: "POST", body: JSON.stringify({ pin }),
      }),
    }).then((result) => {
      if (result) toast(`Atendimento de ${result.pet} finalizado por ${result.attendant}`);
      loadQueue();
    });
  };
  $("#search").addEventListener("input", () => loadQueue());
  loadQueue();
  setInterval(loadQueue, 10000);
});