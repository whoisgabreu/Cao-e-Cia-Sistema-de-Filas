/* Cadastro de atendentes — usa /static/ui.js e /static/admin.js */
const { icon, escapeHtml, avatar, toast, confirmModal, fmtLocalDateTime } = UI;
const api = Admin.api;

function personCard(a) {
  const ativo = a.ativo === 1 || a.ativo === true;
  const badge = ativo
    ? `<span class="badge ativo"><span class="dot"></span>Ativo</span>`
    : `<span class="badge inativo"><span class="dot"></span>Inativo</span>`;
  const actions = ativo
    ? `<button class="btn btn-ghost btn-sm" data-act="edit" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}">${icon("edit")}Editar</button>
       <button class="btn btn-danger btn-sm" data-act="off" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}">${icon("ban")}Desativar</button>`
    : `<button class="btn btn-soft btn-sm" data-act="on" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}">${icon("undo")}Reativar</button>`;
  return `
    <div class="person-card ${ativo ? "" : "inactive"}">
      <div class="person-top">
        ${avatar(a.nome, "person lg")}
        <div>
          <div class="person-name">${escapeHtml(a.nome)}</div>
          <div class="person-meta">${icon("calendar")}<span>Desde ${escapeHtml(fmtLocalDateTime(a.created_at).slice(0, 10))}</span></div>
        </div>
        ${badge}
      </div>
      <div class="person-actions">${actions}</div>
    </div>`;
}

async function loadList() {
  const list = $("#lista");
  list.innerHTML = `<div class="empty panel">${icon("refresh", "spin")}<div class="empty-title">Carregando...</div></div>`;
  try {
    const data = await api("/api/attendants?incluir_inativos=true");
    $("#n-att").textContent = data.filter((a) => a.ativo === 1 || a.ativo === true).length;
    if (!data.length) {
      list.innerHTML = `<div class="empty panel">${UI.mascot("dog")}<div class="empty-title">Nenhum atendente ainda</div><div class="empty-sub">Cadastre o primeiro acima.</div></div>`;
      return;
    }
    data.sort((a, b) => (b.ativo - a.ativo) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    list.innerHTML = data.map(personCard).join("");
    bindListActions();
  } catch (e) {
    list.innerHTML = `<div class="empty panel">${UI.mascot("catSleep")}<div class="empty-title">Erro ao carregar</div><div class="empty-sub">${escapeHtml(e.message)}</div></div>`;
  }
}

function editModal(attendant) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <button class="modal-close" type="button" aria-label="Fechar">${icon("x")}</button>
        <div class="modal-head">
          <div class="modal-icon teal">${icon("edit")}</div>
          <h2>Editar atendente</h2>
          <p>Deixe o PIN em branco para manter o atual.</p>
        </div>
        <label class="field"><span>Nome</span><input type="text" id="edit-nome" maxlength="120" value="${escapeHtml(attendant.nome)}"></label>
        <label class="field"><span>Novo PIN (4 a 6 dígitos)</span><input type="password" id="edit-pin" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="em branco = mantém"></label>
        <div class="modal-err"></div>
        <div class="modal-row">
          <button type="button" class="btn btn-ghost cancel">Cancelar</button>
          <button type="button" class="btn btn-primary ok">${icon("check")}Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const errEl = $(".modal-err", overlay);
    const close = (value) => {
      overlay.classList.add("closing");
      setTimeout(() => overlay.remove(), 150);
      resolve(value);
    };
    const save = async () => {
      const nome = $("#edit-nome", overlay).value.trim();
      const pin = $("#edit-pin", overlay).value.trim();
      if (!nome) { errEl.textContent = "Nome é obrigatório"; return; }
      if (pin && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
        errEl.textContent = "PIN deve ter 4 a 6 dígitos";
        return;
      }
      try {
        await api(`/api/attendants/${attendant.id}`, {
          method: "PUT",
          body: JSON.stringify({ nome, pin: pin || null }),
        });
        close(true);
      } catch (e) {
        errEl.textContent = e.message;
      }
    };
    $(".ok", overlay).onclick = save;
    $(".cancel", overlay).onclick = () => close(null);
    $(".modal-close", overlay).onclick = () => close(null);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") close(null); });
    requestAnimationFrame(() => { overlay.classList.add("open"); $("#edit-nome", overlay).focus(); });
  });
}

function bindListActions() {
  $$("[data-act]").forEach((btn) => {
    btn.onclick = async () => {
      const { act, id, nome } = btn.dataset;
      if (act === "edit") {
        const saved = await editModal({ id, nome });
        if (saved) toast(`${nome} atualizado.`, "success");
        loadList();
      } else if (act === "off") {
        const ok = await confirmModal({
          title: `Desativar ${nome}?`,
          message: "O histórico de auditoria será mantido. Você pode reativar depois.",
          confirmLabel: "Desativar",
          danger: true,
          iconName: "ban",
        });
        if (!ok) return;
        try {
          await api(`/api/attendants/${id}`, { method: "DELETE" });
          toast(`${nome} desativado.`, "info");
          loadList();
        } catch (e) { toast(e.message, "error"); }
      } else if (act === "on") {
        try {
          await api(`/api/attendants/${id}/reativar`, { method: "POST", body: "{}" });
          toast(`${nome} reativado.`, "success");
          loadList();
        } catch (e) { toast(e.message, "error"); }
      }
    };
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $("#salvar").onclick = async () => {
    const nome = $("#nome").value.trim();
    const pin = $("#pin").value.trim();
    if (!nome) { $("#form-err").textContent = "Informe o nome"; $("#nome").focus(); return; }
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      $("#form-err").textContent = "PIN deve ter 4 a 6 dígitos";
      $("#pin").focus();
      return;
    }
    try {
      await api("/api/attendants", { method: "POST", body: JSON.stringify({ nome, pin }) });
      $("#nome").value = "";
      $("#pin").value = "";
      $("#form-err").textContent = "";
      toast(`${nome} cadastrado!`, "success");
      loadList();
    } catch (e) {
      $("#form-err").textContent = e.message;
    }
  };
  $("#pin").onkeydown = (e) => { if (e.key === "Enter") $("#salvar").click(); };
  $("#nome").onkeydown = (e) => { if (e.key === "Enter") $("#pin").focus(); };

  Admin.init(loadList);
});
