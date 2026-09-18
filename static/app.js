/* Painel da fila (Kanban) — usa helpers de /static/ui.js */
/* Visão da recepção: marca chegada e cancela; pegar/finalizar ficam nas telas do atendente. */
const { api, icon, escapeHtml, avatar, toast, confirmModal, elapsedMin, fmtElapsed, fmtLocalTime, setLive, titleCase, serviceChips, infoChips, notes } = UI;

const emptyMeta = {
  aguardando: { mascot: "dogSleep", title: "Nenhum agendamento", sub: "Todos os pets de hoje já chegaram." },
  presente: { mascot: "cat", title: "Ninguém esperando", sub: "Quando um pet chegar, marque \"Chegou\"." },
  em_atendimento: { mascot: "dog", title: "Nenhum banho agora", sub: "Pegue o próximo pet da fila." },
  concluido: { mascot: "catSleep", title: "Nada finalizado ainda", sub: "Os pets prontos aparecem aqui." },
};

function cardHTML(item) {
  const petName = titleCase(item.nom_animal) || "Pet";
  const chips = [];
  if (item.status === "em_atendimento" && item.claimed_at) {
    chips.push(`<span class="chip time">${icon("play")}<span>Início ${fmtLocalTime(item.claimed_at)}</span></span>`);
    chips.push(`<span class="chip elapsed">${icon("timer")}<span class="elapsed-live" data-since="${escapeHtml(item.claimed_at)}">${fmtElapsed(elapsedMin(item.claimed_at))}</span></span>`);
  }
  if (item.status === "concluido" && item.finished_at) {
    chips.push(`<span class="chip time">${icon("checkCircle")}<span>Pronto ${fmtLocalTime(item.finished_at)}</span></span>`);
  }

  let actions = "";
  if (item.status === "aguardando") {
    actions = `<button class="btn btn-amber" data-action="checkin" data-event="${item.cod_evento}">${icon("bell")}Chegou</button>
      <button class="btn btn-ghost btn-icon btn-cancel" data-action="cancel" data-event="${item.cod_evento}" title="Cancelar atendimento" aria-label="Cancelar atendimento">${icon("x")}</button>`;
  } else if (item.status === "presente" || item.status === "em_atendimento") {
    actions = `<button class="btn btn-ghost btn-cancel-text" data-action="cancel" data-event="${item.cod_evento}">${icon("x")}Cancelar</button>`;
  }

  const attendant = item.attendant_nome
    ? `<div class="card-attendant">${avatar(item.attendant_nome, "person")}<span>${escapeHtml(item.attendant_nome)}</span></div>`
    : "";
  const badge = item.status === "em_atendimento"
    ? `<span class="status-pill em_atendimento"><span class="dot"></span>Em banho</span>`
    : "";

  return `
    <article class="card ${item.status}">
      <div class="card-top">
        ${avatar(item.nom_animal)}
        <div class="card-names">
          <div class="pet-name" title="${escapeHtml(item.nom_animal || "")}">${escapeHtml(petName)}</div>
          <div class="tutor-name" title="${escapeHtml(item.nom_cliente || "")}">${icon("user")}<span>${escapeHtml(titleCase(item.nom_cliente))}</span></div>
        </div>
        ${badge}
      </div>
      <div class="chips">${serviceChips(item)}${infoChips(item)}${chips.join("")}</div>
      ${notes(item)}
      ${attendant}
      ${actions ? `<div class="card-actions">${actions}</div>` : ""}
    </article>`;
}

const cancelOrigin = {
  local: { label: "Cancelado aqui", cls: "local" },
  vetsoft: { label: "Cancelado no VetSoft", cls: "vetsoft" },
  sistema: { label: "Dia anterior", cls: "sistema" },
};

function cancelledCard(item) {
  const origin = cancelOrigin[item.cancel_origem] || cancelOrigin.vetsoft;
  const when = item.cancelled_at ? fmtLocalTime(item.cancelled_at) : "";
  return `
    <article class="card cancelado cancel-card">
      <div class="card-top">
        ${avatar(item.nom_animal)}
        <div class="card-names">
          <div class="pet-name">${escapeHtml(titleCase(item.nom_animal) || "Pet")}</div>
          <div class="tutor-name">${icon("user")}<span>${escapeHtml(titleCase(item.nom_cliente))}</span></div>
        </div>
      </div>
      <div class="chips">
        ${infoChips(item)}
        <span class="chip origin ${origin.cls}">${icon("ban")}<span>${origin.label}${when ? ` · ${when}` : ""}</span></span>
      </div>
      ${item.cancel_motivo ? `<div class="note">${icon("info")}<span><b>Motivo:</b> ${escapeHtml(item.cancel_motivo)}</span></div>` : ""}
      ${item.cancel_origem === "local"
        ? `<div class="card-actions"><button class="btn btn-soft" data-action="restore" data-event="${item.cod_evento}">${icon("undo")}Restaurar para a fila</button></div>`
        : `<div class="cancel-hint">${icon("info")}<span>Para voltar à fila, reative o agendamento no VetSoft.</span></div>`}
    </article>`;
}

function emptyHTML(status) {
  const m = emptyMeta[status];
  return `<div class="empty">${UI.mascot(m.mascot)}<div class="empty-title">${m.title}</div><div class="empty-sub">${m.sub}</div></div>`;
}

let lastQueue = [];
let searchQuery = "";

function matches(item, q) {
  if (!q) return true;
  return `${item.nom_animal || ""} ${item.nom_cliente || ""}`.toLowerCase().includes(q);
}

function render(queue) {
  lastQueue = queue;
  const q = searchQuery.toLowerCase();
  const buckets = { aguardando: [], presente: [], em_atendimento: [], concluido: [] };
  const totals = { aguardando: 0, presente: 0, em_atendimento: 0, concluido: 0 };
  const cancelled = [];

  queue.forEach((item) => {
    if (item.status === "cancelado") { if (matches(item, q)) cancelled.push(item); return; }
    if (!buckets[item.status]) return;
    totals[item.status]++;
    if (matches(item, q)) buckets[item.status].push(item);
  });

  const strip = $("#cancel-strip");
  strip.classList.toggle("hidden", cancelled.length === 0);
  $("#cancel-count").textContent = cancelled.length;
  $("#cancel-body").innerHTML = cancelled
    .sort((a, b) => (b.cancelled_at || "").localeCompare(a.cancelled_at || ""))
    .map(cancelledCard).join("");

  const anyMatch = queue.some((item) => matches(item, q));
  $("#board-search-note").classList.toggle("hidden", !(q && !anyMatch));

  Object.entries(buckets).forEach(([status, items]) => {
    $(`.col-${status} .cards`).innerHTML = items.length ? items.map(cardHTML).join("") : emptyHTML(status);
    $(`.col-${status} .count`).textContent = q ? `${items.length}/${totals[status]}` : totals[status];
    const tab = $(`.board-tab[data-view="${status}"] .tab-count`);
    if (tab) tab.textContent = totals[status];
  });

  $("#board-summary").innerHTML = `
    <span class="summary-chip"><span class="dot" style="background:var(--st-presente)"></span><b>${totals.presente}</b> esperando</span>
    <span class="summary-chip"><span class="dot" style="background:var(--st-em_atendimento)"></span><b>${totals.em_atendimento}</b> em banho</span>
    <span class="summary-chip"><span class="dot" style="background:var(--st-concluido)"></span><b>${totals.concluido}</b> prontos hoje</span>`;

  bindActions();
}

function bindActions() {
  $$("[data-action]").forEach((btn) => {
    btn.onclick = () => {
      const { action, event } = btn.dataset;
      const item = lastQueue.find((i) => i.cod_evento === Number(event));
      if (!item) { toast("Pet não encontrado. Atualizando...", "error"); loadQueue(); return; }
      const pet = titleCase(item.nom_animal) || "Pet";

      if (action === "checkin") {
        btn.disabled = true;
        api(`/api/queue/${event}/checkin`, { method: "POST", body: "{}" })
          .then(() => toast(`${pet} chegou e entrou na fila.`, "success"))
          .catch((e) => toast(e.message, "error"))
          .then(() => loadQueue());
      } else if (action === "cancel") {
        confirmModal({
          title: `Cancelar ${pet}?`,
          message: item.status === "em_atendimento"
            ? "O atendimento em andamento será cancelado e o atendente fica livre. Dá para restaurar depois em \"Cancelados hoje\"."
            : "O pet sai da fila de hoje. Dá para restaurar depois em \"Cancelados hoje\".",
          confirmLabel: "Cancelar atendimento",
          cancelLabel: "Voltar",
          danger: true,
          iconName: "ban",
          input: { label: "Motivo (opcional)", placeholder: "Ex.: tutor desmarcou, pet passou mal..." },
        }).then((res) => {
          if (!res) return;
          api(`/api/queue/${event}/cancel`, { method: "POST", body: JSON.stringify({ motivo: res.value || null }) })
            .then(() => toast(`${pet} cancelado.`, "info"))
            .catch((e) => toast(e.message, "error"))
            .then(() => loadQueue());
        });
      } else if (action === "restore") {
        btn.disabled = true;
        api(`/api/queue/${event}/restore`, { method: "POST", body: "{}" })
          .then(() => toast(`${pet} voltou para a fila (Agendados).`, "success"))
          .catch((e) => toast(e.message, "error"))
          .then(() => loadQueue());
      }
    };
  });
}

function tickElapsed() {
  $$(".elapsed-live").forEach((el) => {
    el.textContent = fmtElapsed(elapsedMin(el.dataset.since));
  });
}

async function loadQueue() {
  try {
    const data = await api("/api/queue");
    render(data);
    setLive("ok", `Atualizado ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (e) {
    setLive("error", `Erro: ${e.message}`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const board = $("#board");
  const savedView = localStorage.getItem("board_view") || "aguardando";
  board.dataset.view = savedView;
  $$(".board-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === savedView);
    tab.addEventListener("click", () => {
      board.dataset.view = tab.dataset.view;
      localStorage.setItem("board_view", tab.dataset.view);
      $$(".board-tab").forEach((t) => t.classList.toggle("active", t === tab));
    });
  });

  $("#cancel-toggle").onclick = () => {
    const open = $("#cancel-body").classList.toggle("hidden");
    $("#cancel-toggle").setAttribute("aria-expanded", String(!open));
    $("#cancel-strip").classList.toggle("open", !open);
  };

  $("#board-search").addEventListener("input", () => {
    searchQuery = $("#board-search").value.trim();
    render(lastQueue);
  });

  $("#sync-now").onclick = async () => {
    const btn = $("#sync-now");
    btn.classList.add("loading");
    setLive("loading", "Sincronizando...");
    try {
      const r = await api("/api/sync", { method: "POST", body: "{}" });
      toast(`Sincronizado: ${r.total} agendamento(s) hoje.`, "success");
      await loadQueue();
    } catch (e) {
      setLive("error", `Erro: ${e.message}`);
      toast(e.message, "error");
    } finally {
      btn.classList.remove("loading");
    }
  };

  loadQueue();
  setInterval(loadQueue, 10000);
  setInterval(tickElapsed, 30000);
});
