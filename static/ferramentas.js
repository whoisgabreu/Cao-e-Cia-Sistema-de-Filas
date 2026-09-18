/* Ferramentas de manutenção — usa /static/ui.js e /static/admin.js */
const { icon, escapeHtml, toast, confirmModal } = UI;
const api = Admin.api;

function renderStatus(data) {
  const q = data.queue;
  $("#st-aguardando").textContent = q.aguardando;
  $("#st-em_atendimento").textContent = q.em_atendimento;
  $("#st-concluido").textContent = q.concluido;
  $("#st-cancelado").textContent = q.cancelado;
  $("#st-attendances").textContent = data.attendances;
  $("#st-attendants").textContent = data.attendants;
}

function showMsg(text, isError = false) {
  const box = $("#msg");
  box.className = `result-box show ${isError ? "error" : ""}`;
  box.innerHTML = `${icon(isError ? "alert" : "checkCircle")}<span>${escapeHtml(text)}</span>`;
}

async function refresh() {
  const btn = $("#refresh");
  btn.classList.add("loading");
  try {
    renderStatus(await api("/api/debug/status"));
  } catch (e) {
    showMsg(e.message, true);
  } finally {
    btn.classList.remove("loading");
  }
}

function describe(data) {
  const parts = [];
  if (data.limpos != null) parts.push(`${data.limpos} registro(s) removido(s)`);
  if (data.fila_limpa != null) parts.push(`fila: ${data.fila_limpa} removido(s)`);
  if (data.auditoria_limpa != null) parts.push(`auditoria: ${data.auditoria_limpa} removido(s)`);
  if (data.sync && data.sync.total != null) parts.push(`sincronizado: ${data.sync.total} agendamento(s) hoje`);
  return parts.length ? parts.join(" · ") : JSON.stringify(data);
}

async function doClear(path, title, message, btn) {
  const ok = await confirmModal({ title, message, confirmLabel: "Sim, limpar", danger: true, iconName: "trash" });
  if (!ok) return;
  btn.disabled = true;
  showMsg("Executando...");
  try {
    const data = await api(path, { method: "POST", body: "{}" });
    showMsg(`Concluído. ${describe(data)}`);
    toast("Limpeza concluída.", "success");
    refresh();
  } catch (e) {
    showMsg(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refresh").onclick = refresh;
  $("#btn-queue").onclick = (e) =>
    doClear("/api/debug/clear-queue", "Limpar a fila?",
      "Pets em atendimento e finalizados serão removidos; a fila será recarregada com os agendamentos ativos de hoje.", e.currentTarget);
  $("#btn-audit").onclick = (e) =>
    doClear("/api/debug/clear-audit", "Apagar a auditoria?",
      "Todos os registros de auditoria serão apagados. Esta ação não pode ser desfeita.", e.currentTarget);
  $("#btn-all").onclick = (e) =>
    doClear("/api/debug/clear-all", "Limpar tudo?",
      "Fila e auditoria serão limpas. Atendentes serão mantidos. Esta ação não pode ser desfeita.", e.currentTarget);

  Admin.init(refresh);
});
