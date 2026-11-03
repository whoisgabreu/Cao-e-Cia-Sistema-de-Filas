/* Login por papel — o papel vem da própria rota (/login-recepcao, /login-atendente, /login-admin). */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  const ROLE_TITLES = {
    recepcao: { title: "Recepção", sub: "Acesso da recepção — marcar chegada de pets." },
    atendente: { title: "Atendente", sub: "Acesso da equipe de banho e tosa." },
    admin: { title: "Administração", sub: "Acesso de gerência e auditoria." },
  };
  const HOME = { recepcao: "/", atendente: "/atendente-minimalista", admin: "/audit" };

  function roleFromPath() {
    const p = location.pathname;
    if (p.includes("recepcao")) return "recepcao";
    if (p.includes("atendente")) return "atendente";
    if (p.includes("admin")) return "admin";
    return "recepcao";
  }

  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
    } catch (e) {
      throw new Error("Sem conexão com o servidor.");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || "Não foi possível entrar.");
    return body.data;
  }

  const role = roleFromPath();

  document.addEventListener("DOMContentLoaded", () => {
    const meta = ROLE_TITLES[role] || ROLE_TITLES.recepcao;
    $("#login-title").textContent = meta.title;
    $("#login-sub").textContent = meta.sub;

    // Se já estiver autenticado, vai direto para a tela do papel.
    api("/api/me").then((me) => {
      if (me && me.role) window.location.href = HOME[me.role] || "/";
    }).catch(() => {});

    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = $("#username").value.trim();
      const password = $("#password").value;
      const errEl = $("#login-err");
      errEl.textContent = "";
      if (!username || !password) { errEl.textContent = "Informe usuário e senha."; return; }
      try {
        const data = await api("/api/login", {
          method: "POST",
          body: JSON.stringify({ username, password, role }),
        });
        window.location.href = data.home || HOME[data.role] || "/";
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  });
})();