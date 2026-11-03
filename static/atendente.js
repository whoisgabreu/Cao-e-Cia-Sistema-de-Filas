/* Tela do atendente (tablet) — usa helpers de /static/ui.js */
const { api, icon, escapeHtml, todayStr, avatar, toast, pinModal, elapsedMin, fmtElapsed, fmtLocalTime, setLive, titleCase, serviceChips, infoChips, notes } = UI;

let lastQueue = [];

function waitingCard(item, position) {
  return `
    <article class="card card-lg presente">
      <div class="card-top">
        ${avatar(item.nom_animal)}
        <div class="card-names">
          <div class="pet-name" title="${escapeHtml(item.nom_animal || "")}">${escapeHtml(titleCase(item.nom_animal) || "Pet")}</div>
          <div class="tutor-name" title="${escapeHtml(item.nom_cliente || "")}">${icon("user")}<span>${escapeHtml(titleCase(item.nom_cliente))}</span></div>
        </div>
        <span class="status-pill presente">${icon("bell")}${position === 1 ? "Próximo" : `${position}º na fila`}</span>
      </div>
      <div class="chips">${prioChip(item)}${serviceChips(item)}${infoChips(item)}</div>
      ${notes(item)}
      <div class="card-actions">
        <button class="btn btn-primary btn-lg" data-action="start" data-event="${item.cod_evento}">${icon("play")}Atender pet</button>
      </div>
    </article>`;
}

function doingCard(item) {
  return `
    <article class="card card-lg em_atendimento">
      <div class="card-top">
        ${avatar(item.nom_animal)}
        <div class="card-names">
          <div class="pet-name" title="${escapeHtml(item.nom_animal || "")}">${escapeHtml(titleCase(item.nom_animal) || "Pet")}</div>
          <div class="tutor-name" title="${escapeHtml(item.nom_cliente || "")}">${icon("user")}<span>${escapeHtml(titleCase(item.nom_cliente))}</span></div>
        </div>
        <span class="status-pill em_atendimento"><span class="dot"></span>Em banho</span>
      </div>
      <div class="chips">
        ${serviceChips(item)}${infoChips(item)}
        ${item.claimed_at ? `<span class="chip time">${icon("play")}<span>Início ${fmtLocalTime(item.claimed_at)}</span></span>` : ""}
        ${item.claimed_at ? `<span class="chip elapsed">${icon("timer")}<span class="elapsed-live" data-since="${escapeHtml(item.claimed_at)}"></span></span>` : ""}
      </div>
      ${notes(item)}
      ${item.attendant_nome ? `<div class="card-attendant">${avatar(item.attendant_nome, "person")}<span>${escapeHtml(item.attendant_nome)}</span></div>` : ""}
      <div class="card-actions">
        <button class="btn btn-teal btn-lg" data-action="finish" data-event="${item.cod_evento}">${icon("checkCircle")}Encerrar</button>
      </div>
    </article>`;
}

function doneRow(item) {
  const when = item.finished_at ? fmtLocalTime(item.finished_at) : "";
  return `
    <div class="done-row">
      ${avatar(item.nom_animal, "sm")}
      <div class="done-text">
        <div class="done-pet">${escapeHtml(titleCase(item.nom_animal) || "Pet")}</div>
        <div class="done-meta">${escapeHtml(titleCase(item.nom_cliente))}${item.attendant_nome ? ` · ${escapeHtml(item.attendant_nome)}` : ""}${when ? ` · ${when}` : ""}</div>
      </div>
      ${icon("checkCircle", "check")}
    </div>`;
}

function emptyHTML(mascot, title, sub) {
  return `<div class="empty panel">${UI.mascot(mascot)}<div class="empty-title">${title}</div><div class="empty-sub">${sub}</div></div>`;
}

function startModal(item) {
  return pinModal({
    title: `Atender ${titleCase(item.nom_animal) || "atendimento"}`,
    subtitle: "Digite seu PIN para iniciar o atendimento.",
    tone: "green",
    iconName: "paw",
    onOk: (pin) => api(`/api/queue/${item.cod_evento}/start`, { method: "POST", body: JSON.stringify({ pin }) }),
  });
}

function finishModal(item) {
  return pinModal({
    title: `Encerrar ${titleCase(item.nom_animal) || "atendimento"}`,
    subtitle: item.attendant_nome ? `Digite o PIN de ${item.attendant_nome}, que pegou o pet.` : "Digite o PIN de quem pegou o pet.",
    tone: "teal",
    iconName: "checkCircle",
    onOk: (pin) => api(`/api/queue/${item.cod_evento}/checkout`, { method: "POST", body: JSON.stringify({ pin }) }),
  });
}

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

function render(queue) {
  lastQueue = queue;
  const waiting = sortWaiting(queue.filter((i) => i.status === "presente"));
  const doing = queue.filter((i) => i.status === "em_atendimento");
  const done = queue.filter((i) => i.status === "concluido" && (i.finished_at || "").slice(0, 10) === todayStr());

  $("#c-aguardando").textContent = waiting.length;
  $("#c-em_atendimento").textContent = doing.length;
  $("#c-concluido").textContent = done.length;
  $("#n-waiting").textContent = waiting.length;
  $("#n-doing").textContent = doing.length;
  $("#n-done").textContent = done.length;

  const query = ($("#search").value || "").trim().toLowerCase();
  const filtered = query
    ? waiting.filter((i) =>
        [i.nom_animal, i.nom_cliente, i.num_identificacao]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query)))
    : waiting;

  UI.reconcileList(
    $("#waiting"), filtered, (i) => i.cod_evento,
    (item) => waitingCard(item, waiting.indexOf(item) + 1),
    () => emptyHTML(query ? "cat" : "dogSleep", query ? "Nenhum pet encontrado" : "Ninguém esperando", query ? "Tente outro nome." : "Quando um pet chegar, ele aparece aqui.")
  );

  UI.reconcileList(
    $("#doing"), doing, (i) => i.cod_evento, doingCard,
    () => emptyHTML("dog", "Nenhum banho em andamento", "Pegue o próximo pet da fila.")
  );

  UI.reconcileList(
    $("#done"), done, (i) => i.cod_evento, doneRow,
    () => emptyHTML("catSleep", "Nada finalizado ainda", "Os pets prontos aparecem aqui.")
  );

  bindActions();
  tickElapsed();
}

function bindActions() {
  $$("[data-action]").forEach((btn) => {
    btn.onclick = () => {
      const item = lastQueue.find((i) => i.cod_evento === Number(btn.dataset.event));
      if (!item) { toast("Pet não encontrado. Atualizando...", "error"); loadQueue(); return; }
      const pet = titleCase(item.nom_animal) || "Pet";
      if (btn.dataset.action === "start") {
        startModal(item).then((result) => {
          if (result) toast(`Atendimento de ${pet} iniciado. Bom banho!`, "success");
          loadQueue();
        });
      } else if (btn.dataset.action === "finish") {
        finishModal(item).then((result) => {
          if (result) toast(`${pet} está pronto! Finalizado por ${result.attendant}.`, "success");
          loadQueue();
        });
      }
    };
  });
}

function startNext() {
  const first = sortWaiting(lastQueue.filter((i) => i.status === "presente"))[0];
  if (!first) {
    toast("Nenhum pet esperando na fila.", "info");
    return;
  }
  startModal(first).then((result) => {
    if (result) toast(`Atendimento de ${titleCase(first.nom_animal)} iniciado. Bom banho!`, "success");
    loadQueue();
  });
}

function tickElapsed() {
  $$(".elapsed-live").forEach((el) => { el.textContent = fmtElapsed(elapsedMin(el.dataset.since)); });
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
  $("#btn-next").onclick = startNext;
  $("#btn-finish").onclick = () => {
    pinModal({
      title: "Encerrar atendimento",
      subtitle: "Digite seu PIN para finalizar o seu atendimento em andamento.",
      tone: "teal",
      iconName: "checkCircle",
      onOk: (pin) => api("/api/queue/finish", { method: "POST", body: JSON.stringify({ pin }) }),
    }).then((result) => {
      if (result) toast(`${titleCase(result.pet)} está pronto! Finalizado por ${result.attendant}.`, "success");
      loadQueue();
    });
  };
  $("#search").addEventListener("input", () => render(lastQueue));
  loadQueue();
  UI.connectQueueStream(loadQueue);
  setInterval(tickElapsed, 30000);
});
