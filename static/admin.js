/* Área do administrador — usa a sessão de login (papel admin). */
(function () {
  "use strict";

  /** fetch com cookie de sessão (automático). Em 401 → redireciona ao login admin. */
  async function api(path, options = {}) {
    try {
      return await UI.api(path, options);
    } catch (e) {
      if (e.status === 401) {
        window.location.href = "/login-admin";
      }
      throw e;
    }
  }

  /** A rota da página já exige admin; aqui apenas inicia a tela. */
  function init(callback) {
    (callback || (() => {}))();
  }

  window.Admin = { api, init };
})();