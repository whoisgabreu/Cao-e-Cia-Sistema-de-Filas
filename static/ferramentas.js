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

function showGate() {
  $("#main").style.display = "none";
  $("#gate").classList.add("open");
  $("#gate-err").textContent = "";
  setTimeout(() => $("#gate-pin").focus(), 50);
}

function hideGate() {
  $("#gate").classList.remove("open");
  $("#main").style.display = "block";
  refresh();
}

function renderStatus(data) {
  const q = data.queue;
  $("#st-aguardando").textContent = q.aguardando;
  $("#st-em_atendimento").textContent = q.em_atendimento;
  $("#st-concluido").textContent = q.concluido;
  $("#st-cancelado").textContent = q.cancelado;
  $("#st-attendances").textContent = data.attendances;
  $("#st-attendants").textContent = data.attendants;
}

async function refresh() {
  try {
    renderStatus(await api("/api/debug/status"));
    $("#msg").textContent = "";
  } catch (e) {
    $("#msg").textContent = e.message;
  }
}

async function doClear(path, confirmText) {
  if (!confirm(confirmText)) return;
  $("#msg").textContent = "Executando...";
  try {
    const data = await api(path, { method: "POST", body: "{}" });
    $("#msg").textContent = "Concluído. Limpos: " + JSON.stringify(data);
    refresh();
  } catch (e) {
    $("#msg").textContent = e.message;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#gate-ok").onclick = async () => {
    const pin = $("#gate-pin").value.trim();
    if (pin.length < 4) { $("#gate-err").textContent = "PIN deve ter 4 a 6 dígitos"; return; }
    try {
      adminPin.save(pin);
      await api("/api/admin/check", { method: "POST", body: "{}" });
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

  $("#refresh").onclick = refresh;
  $("#btn-queue").onclick = () =>
    doClear("/api/debug/clear-queue",
      "Limpar a fila? Pets em atendimento e finalizados serão removidos; a fila será recarregada com os agendamentos ativos de hoje.");
  $("#btn-audit").onclick = () =>
    doClear("/api/debug/clear-audit",
      "Apagar todos os registros de auditoria? Esta ação não pode ser desfeita.");
  $("#btn-all").onclick = () =>
    doClear("/api/debug/clear-all",
      "Limpar fila e auditoria? Atendentes serão mantidos. Esta ação não pode ser desfeita.");

  if (adminPin.value) {
    api("/api/debug/status").then(() => hideGate()).catch(() => showGate());
  } else {
    showGate();
  }
});