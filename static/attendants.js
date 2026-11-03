/* Atendentes — usa /static/ui.js e /static/admin.js */
const { icon, escapeHtml, avatar, toast, confirmModal, fmtLocalDateTime } = UI;
const api = Admin.api;

function rowHTML(a) {
  const ativo = a.ativo === 1 || a.ativo === true;
  const badge = ativo
    ? `<span class="badge ativo"><span class="dot"></span>Ativo</span>`
    : `<span class="badge inativo"><span class="dot"></span>Inativo</span>`;
  const actions = ativo
    ? `<button class="btn btn-ghost btn-sm" data-act="edit" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}">${icon("edit")}Editar</button>
       <button class="btn btn-danger btn-sm" data-act="off" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}">${icon("ban")}Desativar</button>`
    : `<button class="btn btn-ghost btn-sm" data-act="edit" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}">${icon("edit")}Editar</button>
       <button class="btn btn-soft btn-sm" data-act="on" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}">${icon("undo")}Reativar</button>`;
  const desde = a.created_at ? fmtLocalDateTime(a.created_at).slice(0, 10) : "-";
  return `
    <tr class="${ativo ? "" : "inactive"}">
      <td><span class="pet-cell">${avatar(a.nome, "person sm")}<span class="att-name">${escapeHtml(a.nome)}</span></span></td>
      <td class="muted">${escapeHtml(desde)}</td>
      <td>${badge}</td>
      <td class="num"><b>${a.total_atendimentos || 0}</b></td>
      <td class="num"><b>${a.atendimentos_mes || 0}</b></td>
      <td><div class="row-actions">${actions}</div></td>
    </tr>`;
}

function emptyHTML() {
  return `<tr><td colspan="6">${UI.mascot("dog")}<div class="empty-title">Nenhum atendente ainda</div><div class="empty-sub">Clique em "Adicionar" para cadastrar o primeiro.</div></td></tr>`;
}

async function loadList() {
  const list = $("#lista");
  list.innerHTML = `<tr><td colspan="6" class="muted">Carregando...</td></tr>`;
  try {
    const data = await api("/api/attendants?incluir_inativos=true");
    $("#n-att").textContent = data.length;
    if (!data.length) {
      list.innerHTML = emptyHTML();
      return;
    }
    list.innerHTML = data.map(rowHTML).join("");
    bindListActions();
  } catch (e) {
    list.innerHTML = `<tr><td colspan="6" class="muted">Erro ao carregar: ${escapeHtml(e.message)}</td></tr>`;
  }
}

function attendantFormModal(attendant = null) {
  const editing = Boolean(attendant);
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <button class="modal-close" type="button" aria-label="Fechar">${icon("x")}</button>
        <div class="modal-head">
          <div class="modal-icon teal">${icon(editing ? "edit" : "plus")}</div>
          <h2>${editing ? "Editar atendente" : "Novo atendente"}</h2>
          <p>${editing ? "Deixe o PIN em branco para manter o atual." : "Cada atendente usa o próprio PIN para pegar e finalizar atendimentos."}</p>
        </div>
        <label class="field"><span>Nome</span><input type="text" id="af-nome" maxlength="120" value="${editing ? escapeHtml(attendant.nome) : ""}" placeholder="Ex.: Ana Souza"></label>
        <label class="field"><span>PIN (4 a 6 dígitos)</span><input type="password" id="af-pin" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="${editing ? "em branco = mantém" : "••••"}"></label>
        <div class="modal-err" role="alert"></div>
        <div class="modal-row">
          <button type="button" class="btn btn-ghost cancel">Cancelar</button>
          <button type="button" class="btn btn-primary ok">${icon("check")}${editing ? "Salvar" : "Cadastrar"}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const errEl = $(".modal-err", overlay);
    const nomeEl = $("#af-nome", overlay);
    const pinEl = $("#af-pin", overlay);
    const okBtn = $(".ok", overlay);

    const close = (value) => {
      document.removeEventListener("keydown", onKey);
      overlay.classList.add("closing");
      setTimeout(() => overlay.remove(), 150);
      resolve(value);
    };

    const fail = (msg, el) => {
      errEl.textContent = msg;
      el.focus();
    };

    const save = async () => {
      const nome = nomeEl.value.trim();
      const pin = pinEl.value.trim();
      if (!nome) return fail("Informe o nome.", nomeEl);
      if (!editing && !pin) return fail("Informe o PIN.", pinEl);
      if (pin && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
        return fail("PIN deve ter 4 a 6 dígitos.", pinEl);
      }

      okBtn.disabled = true;
      try {
        if (editing) {
          await api(`/api/attendants/${attendant.id}`, {
            method: "PUT",
            body: JSON.stringify({ nome, pin: pin || null }),
          });
        } else {
          await api("/api/attendants", { method: "POST", body: JSON.stringify({ nome, pin }) });
        }
        close({ nome, editing });
      } catch (e) {
        errEl.textContent = e.message;
      } finally {
        okBtn.disabled = false;
      }
    };

    const onKey = (e) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", onKey);
    okBtn.onclick = save;
    $(".cancel", overlay).onclick = () => close(null);
    $(".modal-close", overlay).onclick = () => close(null);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    requestAnimationFrame(() => { overlay.classList.add("open"); nomeEl.focus(); });
  });
}

function bindListActions() {
  $$("[data-act]").forEach((btn) => {
    btn.onclick = async () => {
      const { act, id, nome } = btn.dataset;
      if (act === "edit") {
        const saved = await attendantFormModal({ id, nome });
        if (saved) toast(`${saved.nome} atualizado.`, "success");
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
  $("#add-att").onclick = async () => {
    const saved = await attendantFormModal(null);
    if (saved) toast(`${saved.nome} cadastrado!`, "success");
    loadList();
  };

  Admin.init(loadList);
});
