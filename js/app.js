/* Inicializa dados e eventos depois que a estrutura HTML foi carregada. */
(function (window) {
  const App = window.App = window.App || {};

  // Carrega os dados, prepara os formulários e exibe a tela inicial.
  App.start = function () {
    App.Cardapio.init();
    App.Agendamentos.init();
    App.UI.init();
    App.Utils.$("#summary-date").value = App.Utils.displayDate(App.Utils.todayISO());
    App.UI.renderMenu();
    App.UI.addPizzaRow();
    App.UI.renderAll();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", App.start, { once: true });
  } else {
    App.start();
  }
})(window);
