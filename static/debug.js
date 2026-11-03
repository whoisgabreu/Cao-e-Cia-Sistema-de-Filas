/* Página oculta de testes — limpeza protegida pela senha do administrador. */
const { api, icon, escapeHtml, toast, confirmModal } = UI;

function showMsg(text, isError = false) {
  const box = $("#msg");
  box.className = `result-box show ${isError ? "error" : ""}`;
  box.innerHTML = `${icon(isError ? "alert" : "checkCircle")}<span>${escapeHtml(text)}</span>`;
}

function describe(data) {
  const parts = [];
  if (data.limpos != null) parts.push(`${data.limpos} registro(s) removido(s)`);
  if (data.fila_limpa != null) parts.push(`fila: ${data.fila_limpa} removido(s)`);
  if (data.auditoria_limpa != null) parts.push(`auditoria: ${data.auditoria_limpa} removido(s)`);
  if (data.sync && data.sync.total != null) parts.push(`sincronizado: ${data.sync.total} agendamento(s) hoje`);
  return parts.length ? parts.join(" · ") : "Concluído.";
}

async function doClear(path, title, message, btn) {
  const res = await confirmModal({
    title,
    message,
    confirmLabel: "Sim, limpar",
    danger: true,
    iconName: "trash",
    input: {
      label: "Senha de administrador",
      type: "password",
      placeholder: "Digite a senha do admin",
      required: true,
      requiredMessage: "Informe a senha do administrador.",
      maxLength: 200,
    },
  });
  if (!res) return;
  const password = (res.value || "").trim();
  if (!password) return;

  btn.disabled = true;
  showMsg("Executando...");
  try {
    const data = await api(path, { method: "POST", body: JSON.stringify({ password }) });
    showMsg(`Concluído. ${describe(data)}`);
    toast("Limpeza concluída.", "success");
  } catch (e) {
    showMsg(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-queue").onclick = (e) =>
    doClear("/api/debug/clear-queue", "Limpar a fila?",
      "Pets em atendimento e finalizados serão removidos; a fila será recarregada com os agendamentos ativos de hoje.", e.currentTarget);
  $("#btn-audit").onclick = (e) =>
    doClear("/api/debug/clear-audit", "Apagar a auditoria?",
      "Todos os registros de auditoria serão apagados. Esta ação não pode ser desfeita.", e.currentTarget);
  $("#btn-all").onclick = (e) =>
    doClear("/api/debug/clear-all", "Limpar tudo?",
      "Fila e auditoria serão limpas. Atendentes serão mantidos. Esta ação não pode ser desfeita.", e.currentTarget);
});
