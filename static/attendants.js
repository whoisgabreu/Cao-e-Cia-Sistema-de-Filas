const $ = (sel) => document.querySelector(sel);

const adminPin = {
  value: sessionStorage.getItem("admin_pin") || "",
  save(pin) {
    this.value = pin;
    sessionStorage.setItem("admin_pin", pin);
  },
  clear() {
    this.value = "";
    sessionStorage.removeItem("admin_pin");
  },
};

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (adminPin.value) headers["X-Admin-Pin"] = adminPin.value;
  const res = await fetch(path, { headers, ...options });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    adminPin.clear();
    showGate();
    throw new Error(body.detail || "Sessão expirada. Informe o PIN novamente.");
  }
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

function showGate() {
  $("#main").style.display = "none";
  $("#gate").classList.add("open");
  $("#gate-err").textContent = "";
  setTimeout(() => $("#gate-pin").focus(), 50);
}

function hideGate() {
  $("#gate").classList.remove("open");
  $("#main").style.display = "block";
  loadList();
}

async function tryAdmin(pin) {
  adminPin.save(pin);
  await api("/api/admin/check", {
    method: "POST", body: JSON.stringify({}),
  });
}

async function loadList() {
  const tbody = $("#lista");
  tbody.innerHTML = `<tr><td colspan="4">Carregando...</td></tr>`;
  try {
    const data = await api("/api/attendants?incluir_inativos=true");
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="4">Nenhum atendente cadastrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((a) => {
      const ativo = a.ativo === 1 || a.ativo === true;
      const badge = ativo
        ? `<span class="badge ativo">Ativo</span>`
        : `<span class="badge inativo">Inativo</span>`;
      const actions = ativo
        ? `<button class="btn-edit" data-id="${a.id}">Editar</button>
           <button class="btn-danger" data-id="${a.id}">Desativar</button>`
        : `<button class="btn-danger" data-id="${a.id}" data-reactivate="1">Reativar</button>`;
      return `
        <tr>
          <td>${escapeHtml(a.nome)}</td>
          <td>${badge}</td>
          <td>${escapeHtml(a.created_at)}</td>
          <td class="num" style="white-space:nowrap;">${actions}</td>
        </tr>`;
    }).join("");
    bindListActions();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4">Erro: ${escapeHtml(e.message)}</td></tr>`;
  }
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
        await onOk(pin);
        close(null);
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

function editModal(attendant) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open";
    overlay.innerHTML = `
      <div class="modal">
        <h2>Editar ${escapeHtml(attendant.nome)}</h2>
        <p>PIN em branco mantém o atual.</p>
        <label class="modal-label">Nome
          <input type="text" id="edit-nome" maxlength="120" value="${escapeHtml(attendant.nome)}">
        </label>
        <label class="modal-label">Novo PIN (4 a 6 dígitos)
          <input type="password" id="edit-pin" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="em branco = mantém">
        </label>
        <div class="err"></div>
        <div class="row">
          <button class="cancel">Cancelar</button>
          <button class="ok">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const errEl = overlay.querySelector(".err");
    const close = (value) => { overlay.remove(); resolve(value); };
    overlay.querySelector(".ok").onclick = async () => {
      const nome = overlay.querySelector("#edit-nome").value.trim();
      const pin = overlay.querySelector("#edit-pin").value.trim();
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
        close(null);
      } catch (e) {
        errEl.textContent = e.message;
      }
    };
    overlay.querySelector(".cancel").onclick = () => close(null);
  });
}

function bindListActions() {
  document.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.onclick = async () => {
      const row = btn.closest("tr");
      const nome = row.querySelector("td").textContent;
      const attendant = { id: btn.dataset.id, nome };
      await editModal(attendant);
      loadList();
    };
  });
  document.querySelectorAll(".btn-danger").forEach((btn) => {
    btn.onclick = async () => {
      const row = btn.closest("tr");
      const nome = row.querySelector("td").textContent;
      if (btn.dataset.reactivate) {
        if (!confirm(`Reativar ${nome}?`)) return;
        try {
          await api(`/api/attendants/${btn.dataset.id}/reativar`, { method: "POST", body: "{}" });
          loadList();
        } catch (e) { alert(e.message); }
      } else {
        if (!confirm(`Desativar ${nome}? O histórico de auditoria será mantido.`)) return;
        try {
          await api(`/api/attendants/${btn.dataset.id}`, { method: "DELETE" });
          loadList();
        } catch (e) { alert(e.message); }
      }
    };
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $("#gate-ok").onclick = async () => {
    const pin = $("#gate-pin").value.trim();
    if (pin.length < 4) { $("#gate-err").textContent = "PIN deve ter 4 a 6 dígitos"; return; }
    try {
      await tryAdmin(pin);
      $("#gate-pin").value = "";
      hideGate();
    } catch (e) {
      $("#gate-err").textContent = e.message;
      $("#gate-pin").value = "";
      $("#gate-pin").focus();
    }
  };
  $("#gate-pin").onkeydown = (e) => { if (e.key === "Enter") $("#gate-ok").click(); };
  $("#gate-cancel").onclick = () => { window.location.href = "/"; };

  $("#salvar").onclick = async () => {
    const nome = $("#nome").value.trim();
    const pin = $("#pin").value.trim();
    if (!nome) { $("#form-err").textContent = "Informe o nome"; return; }
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      $("#form-err").textContent = "PIN deve ter 4 a 6 dígitos";
      return;
    }
    try {
      await api("/api/attendants", {
        method: "POST", body: JSON.stringify({ nome, pin }),
      });
      $("#nome").value = "";
      $("#pin").value = "";
      $("#form-err").textContent = "";
      loadList();
    } catch (e) {
      $("#form-err").textContent = e.message;
    }
  };

  if (adminPin.value) {
    tryAdmin(adminPin.value).then(hideGate).catch(() => showGate());
  } else {
    showGate();
  }
});