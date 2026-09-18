/* Portaria de administrador (PIN) compartilhada por Atendentes e Ferramentas. */
(function () {
  "use strict";

  const store = {
    get() { return sessionStorage.getItem("admin_pin") || ""; },
    set(pin) { sessionStorage.setItem("admin_pin", pin); },
    clear() { sessionStorage.removeItem("admin_pin"); },
  };

  /** fetch com cabeçalho X-Admin-Pin; em 401 limpa a sessão e reabre a portaria. */
  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const pin = store.get();
    if (pin) headers["X-Admin-Pin"] = pin;
    try {
      return await UI.api(path, { ...options, headers });
    } catch (e) {
      if (e.status === 401) {
        store.clear();
        gate();
      }
      throw e;
    }
  }

  let onEnter = () => {};
  let gateOpen = false;

  async function check(pin) {
    store.set(pin);
    try {
      await UI.api("/api/admin/check", { method: "POST", body: "{}", headers: { "X-Admin-Pin": pin } });
    } catch (e) {
      store.clear();
      throw e;
    }
  }

  function gate() {
    if (gateOpen) return;
    gateOpen = true;
    document.querySelectorAll(".admin-only").forEach((el) => el.classList.add("hidden"));
    UI.pinModal({
      title: "Área do administrador",
      subtitle: "Digite o PIN de administrador para continuar.",
      tone: "teal",
      iconName: "shield",
      onOk: check,
    }).then((ok) => {
      gateOpen = false;
      if (!ok) { window.location.href = "/"; return; }
      enter();
    });
  }

  function enter() {
    document.querySelectorAll(".admin-only").forEach((el) => el.classList.remove("hidden"));
    onEnter();
  }

  /** Inicializa: valida PIN salvo na sessão ou abre a portaria. */
  function init(callback) {
    onEnter = callback || (() => {});
    const logout = document.getElementById("logout");
    if (logout) {
      logout.onclick = () => { store.clear(); gate(); };
    }
    const saved = store.get();
    if (saved) {
      check(saved).then(enter).catch(() => gate());
    } else {
      gate();
    }
  }

  window.Admin = { api, init, gate };
})();
