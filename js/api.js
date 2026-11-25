/* Camada autenticada de acesso ao backend PostgreSQL. */
(function (window) {
  const App = window.App = window.App || {};
  const base = "/api/v1";
  let started = false;
  let uiInitialized = false;
  let refreshTimer;

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body != null) headers.set("content-type", "application/json");
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers,
      credentials: "same-origin",
      body: options.body == null ? undefined : JSON.stringify(options.body)
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Falha na API (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function showConnection(title, message, { login = false, retry = false } = {}) {
    App.Utils.$("#application").classList.add("hidden");
    App.Utils.$("#connection-view").classList.remove("hidden");
    App.Utils.$("#connection-title").textContent = title;
    App.Utils.$("#connection-message").textContent = message;
    App.Utils.$("#admin-login").classList.toggle("hidden", !login);
    App.Utils.$("#connection-retry").classList.toggle("hidden", !retry);
    App.Utils.$("#admin-logout").classList.add("hidden");
  }

  function legacyValue(key) {
    return App.Storage.read(key, null);
  }

  async function loadPanel() {
    let [appointments, menu, satisfaction] = await Promise.all([
      request("/admin/agendamentos"),
      request("/admin/cardapio"),
      request("/admin/satisfacao")
    ]);

    if (!menu.items.length) {
      const legacyMenu = legacyValue(App.Storage.keys.menu);
      const seed = Array.isArray(legacyMenu) ? legacyMenu : App.Cardapio.initial();
      await request("/admin/cardapio", { method: "PUT", body: { items: seed } });
      menu = await request("/admin/cardapio");
    }

    const legacyAppointments = legacyValue(App.Storage.keys.appointments);
    const legacyFeedback = legacyValue("mascavo-satisfacao-v1");
    if (!appointments.items.length &&
        ((Array.isArray(legacyAppointments) && legacyAppointments.length) ||
         (Array.isArray(legacyFeedback) && legacyFeedback.length))) {
      await request("/admin/migrar-dados-locais", {
        method: "POST",
        body: {
          appointments: Array.isArray(legacyAppointments) ? legacyAppointments : [],
          feedback: Array.isArray(legacyFeedback) ? legacyFeedback : []
        }
      });
      localStorage.removeItem(App.Storage.keys.appointments);
      localStorage.removeItem("mascavo-satisfacao-v1");
      [appointments, satisfaction] = await Promise.all([
        request("/admin/agendamentos"),
        request("/admin/satisfacao")
      ]);
    }

    App.Cardapio.init(menu.items);
    App.Agendamentos.init(appointments.items);
    App.Satisfacao.init(satisfaction);
    if (!uiInitialized) {
      App.UI.init();
      uiInitialized = true;
    }
    App.Utils.$("#summary-date").value = App.Utils.displayDate(App.Utils.todayISO());
    App.UI.renderMenu();
    App.UI.renderPizzaMenu();
    App.UI.renderAll();
    App.Utils.$("#connection-view").classList.add("hidden");
    App.Utils.$("#application").classList.remove("hidden");
    App.Utils.$("#admin-logout").classList.remove("hidden");
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, 30000);
  }

  async function refresh() {
    try {
      const [appointments, satisfaction] = await Promise.all([
        request("/admin/agendamentos"),
        request("/admin/satisfacao")
      ]);
      App.Agendamentos.init(appointments.items);
      App.Satisfacao.init(satisfaction);
      App.UI.renderAll();
    } catch (error) {
      if (error.status === 401) {
        clearInterval(refreshTimer);
        showConnection("Sessão expirada", "Entre novamente para continuar usando o painel.", { login: true });
      } else {
        console.error("Falha ao atualizar dados do painel.", error);
      }
    }
  }

  async function connect() {
    showConnection("Conectando ao banco de dados", "Verificando a API local e a conexão PostgreSQL.");
    try {
      await request("/health");
    } catch (error) {
      showConnection("Backend indisponível", `${error.message} Inicie o servidor com npm start e tente novamente.`, { retry: true });
      return;
    }
    try {
      await request("/admin/session");
      await loadPanel();
    } catch (error) {
      if (error.status === 401) {
        showConnection("Acesso administrativo", "Digite o token administrativo configurado no arquivo .env.", { login: true });
        App.Utils.$("#admin-token").focus();
        return;
      }
      showConnection("Não foi possível carregar o painel", error.message, { retry: true });
    }
  }

  App.Api = {
    request,
    initialize() {
      if (started) return;
      started = true;
      App.Utils.$("#admin-login").addEventListener("submit", async event => {
        event.preventDefault();
        const token = App.Utils.$("#admin-token").value;
        const errorOutput = App.Utils.$("#login-error");
        errorOutput.textContent = "";
        try {
          await request("/admin/session", { method: "POST", body: { token } });
          App.Utils.$("#admin-token").value = "";
          await loadPanel();
        } catch (error) {
          errorOutput.textContent = error.message;
        }
      });
      App.Utils.$("#connection-retry").addEventListener("click", connect);
      App.Utils.$("#admin-logout").addEventListener("click", async () => {
        clearInterval(refreshTimer);
        try {
          await request("/admin/session", { method: "DELETE" });
          showConnection("Acesso administrativo", "Digite o token administrativo configurado no arquivo .env.", { login: true });
        } catch (error) {
          App.Utils.toast(`Não foi possível encerrar a sessão: ${error.message}`);
        }
      });
      connect();
    },
    saveAppointment(item) {
      return request(`/admin/agendamentos/${encodeURIComponent(item.id)}`, { method: "PUT", body: item });
    },
    deleteAppointment(id) {
      return request(`/admin/agendamentos/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    saveMenu(items) {
      return request("/admin/cardapio", { method: "PUT", body: { items } });
    }
  };
})(window);
