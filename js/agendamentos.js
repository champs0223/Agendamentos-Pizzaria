/* Dados, validações, totais e operações dos agendamentos. */
(function (window) {
  const App = window.App = window.App || {};
  const STATUSES = ["Agendado", "Em preparo", "Saiu para entrega", "Entregue", "Cancelado"];
  let items = [];

  // Completa e normaliza os campos recebidos do armazenamento ou do backup.
  function normalize(item) {
    return {
      ...item,
      date: String(item.date || ""),
      time: String(item.time || ""),
      deliveryFee: Number(item.deliveryFee) || 0,
      discountType: item.discountType === "percent" ? "percent" : "amount",
      discountValue: Number(item.discountValue) || 0,
      discountAmount: Number(item.discountAmount) || 0,
      pizzas: item.pizzas.map(pizza => ({
        flavor: String(pizza.flavor || ""),
        category: String(pizza.category || "Personalizado"),
        size: String(pizza.size || ""),
        quantity: Number(pizza.quantity) || 0,
        unitPrice: Number(pizza.unitPrice) || 0,
        menuId: pizza.menuId || ""
      }))
    };
  }

  App.Agendamentos = {
    statuses: STATUSES,
    normalize,
    // Carrega os pedidos persistidos no navegador.
    init() {
      const saved = App.Storage.read(App.Storage.keys.appointments, []);
      items = Array.isArray(saved)
        ? saved.filter(item => item && item.id && Array.isArray(item.pizzas)).map(normalize)
        : [];
    },
    // Retorna uma cópia dos pedidos atuais.
    getAll() { return [...items]; },
    // Localiza um pedido pelo identificador.
    find(id) { return items.find(item => item.id === id); },
    // Substitui os pedidos existentes por uma lista importada.
    replace(nextItems) {
      const previous = items;
      items = nextItems.map(normalize);
      if (!App.Storage.write(App.Storage.keys.appointments, items)) {
        items = previous;
        return false;
      }
      return true;
    },
    // Calcula subtotal, desconto e total final do pedido.
    calculate(pizzas, fee, discountType, discountValue) {
      const subtotal = pizzas.reduce((sum, pizza) => sum + App.Utils.itemTotal(pizza), 0);
      const rawDiscount = discountType === "percent"
        ? subtotal * Math.max(0, Number(discountValue) || 0) / 100
        : Math.max(0, Number(discountValue) || 0);
      const discount = Math.min(subtotal, rawDiscount);
      return { subtotal, discount, total: Math.max(0, subtotal + (Number(fee) || 0) - discount) };
    },
    // Cria ou atualiza um pedido e persiste os dados.
    save(item) {
      const previous = items;
      items = item.id && items.some(entry => entry.id === item.id)
        ? items.map(entry => entry.id === item.id ? item : entry)
        : [...items, item];
      if (!App.Storage.write(App.Storage.keys.appointments, items)) {
        items = previous;
        return false;
      }
      return true;
    },
    // Exclui um pedido e persiste a lista.
    remove(id) {
      const previous = items;
      items = items.filter(item => item.id !== id);
      if (!App.Storage.write(App.Storage.keys.appointments, items)) {
        items = previous;
        return false;
      }
      return true;
    },
    // Atualiza o status do pedido selecionado.
    changeStatus(id, status) {
      if (!STATUSES.includes(status)) return false;
      const previous = items;
      items = items.map(item => item.id === id ? { ...item, status } : item);
      if (!App.Storage.write(App.Storage.keys.appointments, items)) {
        items = previous;
        return false;
      }
      return true;
    },
    // Localiza entregas próximas para mostrar o alerta de horário.
    near(item) {
      const minutes = value => {
        if (!App.Utils.timeValid(value)) return NaN;
        const [hours, mins] = value.split(":").map(Number);
        return hours * 60 + mins;
      };
      return items.filter(other =>
        other.id !== item.id && other.date === item.date &&
        !["Cancelado", "Entregue"].includes(other.status) &&
        Number.isFinite(minutes(item.time)) && Number.isFinite(minutes(other.time)) &&
        Math.abs(minutes(item.time) - minutes(other.time)) < 30
      );
    },
    // Valida os campos obrigatórios e os itens de pizza.
    validate(item, dateText) {
      const errors = {};
      if (!item.name) errors.name = "Informe o nome de quem pediu.";
      const digits = item.phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 11) errors.phone = "Informe um telefone com DDD (10 ou 11 dígitos).";
      if (!dateText) errors.date = "Informe a data no formato dd/mm/aaaa.";
      else if (!item.date) errors.date = "Data inválida. Informe uma data existente no formato dd/mm/aaaa.";
      if (!item.time) errors.time = "Informe o horário no formato HH:MM.";
      else if (!App.Utils.timeValid(item.time)) errors.time = "Horário inválido. Use 00:00 a 23:59.";
      if (!item.pizzas.length || item.pizzas.some(pizza =>
        !pizza.flavor || !["Broto", "Média", "Grande"].includes(pizza.size) ||
        !Number.isInteger(pizza.quantity) || pizza.quantity < 1 ||
        !Number.isFinite(pizza.unitPrice) || pizza.unitPrice < 0
      )) errors.pizzas = "Preencha sabor, tamanho, quantidade maior que zero e preço de cada item.";
      if (item.people !== "" && (!Number.isInteger(item.people) || item.people < 1)) {
        errors.people = "Informe uma quantidade inteira maior que zero.";
      }
      return errors;
    },
    // Confere se a data e o horário já passaram.
    hasPassed(date, time) {
      const parsed = App.Utils.isoToDate(date);
      if (!parsed || !App.Utils.timeValid(time)) return false;
      const [hours, minutes] = time.split(":").map(Number);
      parsed.setHours(hours, minutes, 0, 0);
      return parsed < new Date();
    }
  };
})(window);
