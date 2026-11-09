/* Leitura e gravação do armazenamento local, preservando as chaves existentes. */
(function (window) {
  const App = window.App = window.App || {};
  const KEYS = {
    appointments: "forno-festa-agendamentos-v1",
    menu: "forno-festa-cardapio-v1"
  };

  App.Storage = {
    keys: KEYS,
    // Lê JSON local e retorna o valor alternativo em caso de falha.
    read(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
      } catch (error) {
        console.error(`Falha ao ler ${key}.`, error);
        App.Utils.toast("Não foi possível ler dados salvos; confira o armazenamento do navegador.");
        return fallback;
      }
    },
    // Salva JSON local e informa se a operação foi concluída.
    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.error(`Falha ao salvar ${key}.`, error);
        App.Utils.toast("Erro ao salvar. O armazenamento pode estar indisponível ou cheio.");
        return false;
      }
    }
  };
})(window);
