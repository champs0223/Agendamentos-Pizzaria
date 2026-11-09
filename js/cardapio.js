/* Cardápio inicial e operações para manter sabores e preços. */
(function (window) {
  const App = window.App = window.App || {};
  const initialRows = [
    ["Tradicional", "Mussarela", 28, 45, 58], ["Tradicional", "Calabresa", 30, 48, 62],
    ["Tradicional", "Portuguesa", 32, 52, 66], ["Tradicional", "Marguerita", 32, 50, 64],
    ["Tradicional", "Napolitana", 30, 48, 62], ["Tradicional", "Frango com Catupiry", 34, 54, 68],
    ["Tradicional", "Atum", 34, 54, 68], ["Tradicional", "Quatro Queijos", 36, 56, 72],
    ["Especial", "Bacon", 36, 58, 74], ["Especial", "Lombo Canadense", 36, 56, 72],
    ["Especial", "Pepperoni", 38, 60, 76], ["Especial", "Carne Seca com Catupiry", 40, 62, 80],
    ["Especial", "Camarão", 48, 72, 92], ["Doce", "Chocolate", 32, 50, 64],
    ["Doce", "Banana com Canela", 30, 48, 60], ["Doce", "Romeu e Julieta", 34, 52, 66]
  ];
  let items = [];

  // Mantém os itens importados no formato esperado pelo aplicativo.
  function normalize(item) {
    return {
      id: String(item.id || App.Utils.makeId()),
      category: String(item.category || "Tradicional"),
      name: String(item.name || ""),
      prices: {
        Broto: Number(item.prices?.Broto) || 0,
        "Média": Number(item.prices?.["Média"]) || 0,
        Grande: Number(item.prices?.Grande) || 0
      },
      available: item.available !== false
    };
  }

  App.Cardapio = {
    normalize,
    // Carrega o cardápio salvo ou cria a lista inicial.
    init() {
      const saved = App.Storage.read(App.Storage.keys.menu, null);
      if (Array.isArray(saved)) {
        items = saved.filter(item => item && item.id && item.prices).map(normalize);
      } else {
        items = this.initial();
        App.Storage.write(App.Storage.keys.menu, items);
      }
    },
    // Cria os itens padrão com identificadores novos.
    initial() {
      return initialRows.map(([category, name, broto, media, grande]) => ({
        id: App.Utils.makeId(), category, name,
        prices: { Broto: broto, "Média": media, Grande: grande },
        available: true
      }));
    },
    // Retorna uma cópia dos sabores cadastrados.
    getAll() { return [...items]; },
    // Localiza um sabor pelo identificador.
    find(id) { return items.find(item => item.id === id); },
    // Substitui todo o cardápio, por exemplo, durante a importação.
    replace(nextItems) {
      const previous = items;
      items = nextItems.map(normalize);
      if (!App.Storage.write(App.Storage.keys.menu, items)) {
        items = previous;
        return false;
      }
      return true;
    },
    // Insere ou atualiza um sabor.
    save(item) {
      const old = items;
      items = items.some(entry => entry.id === item.id)
        ? items.map(entry => entry.id === item.id ? item : entry)
        : [...items, item];
      if (!App.Storage.write(App.Storage.keys.menu, items)) {
        items = old;
        return false;
      }
      return true;
    },
    // Alterna a disponibilidade de um sabor.
    toggle(id) {
      const old = items;
      items = items.map(item => item.id === id ? { ...item, available: !item.available } : item);
      if (!App.Storage.write(App.Storage.keys.menu, items)) {
        items = old;
        return false;
      }
      return true;
    },
    // Remove um sabor do cardápio.
    remove(id) {
      const old = items;
      items = items.filter(item => item.id !== id);
      if (!App.Storage.write(App.Storage.keys.menu, items)) {
        items = old;
        return false;
      }
      return true;
    },
    // Restaura a lista inicial de sabores.
    restore() {
      const old = items;
      items = this.initial();
      if (!App.Storage.write(App.Storage.keys.menu, items)) {
        items = old;
        return false;
      }
      return true;
    }
  };
})(window);
