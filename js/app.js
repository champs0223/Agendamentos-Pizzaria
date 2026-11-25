/* Inicializa dados e eventos depois que a estrutura HTML foi carregada. */
(function (window) {
  const App = window.App = window.App || {};

  App.start = function () { App.Api.initialize(); };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", App.start, { once: true });
  } else {
    App.start();
  }
})(window);
