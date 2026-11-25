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
    init(saved = []) {
      items = Array.isArray(saved)
        ? saved.filter(item => item && item.id && item.prices).map(normalize)
        : [];
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
    async replace(nextItems) {
      const next = nextItems.map(normalize);
      try {
        await App.Api.saveMenu(next);
        items = next;
      } catch (error) {
        App.Utils.toast(`Não foi possível salvar o cardápio: ${error.message}`);
        return false;
      }
      return true;
    },
    // Insere ou atualiza um sabor.
    async save(item) {
      const next = items.some(entry => entry.id === item.id)
        ? items.map(entry => entry.id === item.id ? item : entry)
        : [...items, item];
      return this.replace(next);
    },
    async toggle(id) {
      return this.replace(items.map(item => item.id === id ? { ...item, available: !item.available } : item));
    },
    async remove(id) {
      return this.replace(items.filter(item => item.id !== id));
    },
    async restore() {
      return this.replace(this.initial());
    }
  };
})(window);
