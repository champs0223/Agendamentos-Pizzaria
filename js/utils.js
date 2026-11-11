/* Formatação, máscaras, escape de HTML e funções auxiliares compartilhadas. */
(function (window) {
  const App = window.App = window.App || {};
  let toastTimer;

  App.Utils = {
    // Busca um elemento ou uma lista de elementos na página.
    $: (selector, root = document) => root.querySelector(selector),
    $$: (selector, root = document) => Array.from(root.querySelectorAll(selector)),
    // Gera um identificador único para cada registro.
    makeId() {
      return window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    },
    // Converte a data local atual para o padrão ISO.
    todayISO(date = new Date()) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    },
    localDateTime(date = new Date()) {
      return `${this.todayISO(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
    },
    addMinutes(value, minutes) {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return "";
      date.setMinutes(date.getMinutes() + Number(minutes || 0));
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    },
    // Converte ISO em data local sem deslocamento de fuso.
    isoToDate(value) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
      if (!match) return null;
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return date.getFullYear() === Number(match[1]) &&
        date.getMonth() === Number(match[2]) - 1 &&
        date.getDate() === Number(match[3]) ? date : null;
    },
    // Valida dd/mm/aaaa e retorna a data em ISO.
    dateToISO(value) {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || ""));
      if (!match || !this.isoToDate(`${match[3]}-${match[2]}-${match[1]}`)) return null;
      return `${match[3]}-${match[2]}-${match[1]}`;
    },
    // Exibe uma data ISO no padrão brasileiro.
    displayDate(value) {
      const date = this.isoToDate(value);
      return date ? date.toLocaleDateString("pt-BR") : "Data não informada";
    },
    // Confere se o horário existe no formato de 24 horas.
    timeValid(value) {
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
    },
    // Aplica a máscara brasileira de data.
    maskDate(value) {
      const digits = String(value).replace(/\D/g, "").slice(0, 8);
      if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
      if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
      return digits;
    },
    // Aplica a máscara de hora de 24 horas.
    maskTime(value) {
      const digits = String(value).replace(/\D/g, "").slice(0, 4);
      return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    },
    // Formata telefone brasileiro com DDD.
    maskPhone(value) {
      const digits = String(value).replace(/\D/g, "").slice(0, 11);
      if (digits.length <= 2) return digits ? `(${digits}` : "";
      if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    },
    // Escapa texto para inserção segura em HTML.
    escape(value) {
      return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[char]));
    },
    // Formata valores monetários em reais.
    money(value) {
      return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    },
    // Monta o endereço completo do pedido.
    address(item) {
      return [item.street, item.number, item.neighborhood, item.complement,
        item.reference ? `Referência: ${item.reference}` : ""]
        .filter(part => String(part || "").trim()).join(", ");
    },
    // Calcula o valor ainda não pago do pedido.
    balance(item) {
      return Math.max(0, (Number(item.total) || 0) - (Number(item.deposit) || 0));
    },
    // Calcula o subtotal de uma pizza.
    itemTotal(pizza) {
      return (Number(pizza.quantity) || 0) * (Number(pizza.unitPrice) || 0);
    },
    // Seleciona a classe visual correspondente ao status.
    statusClass(status) {
      return ({
        "Agendado": "status-agendado",
        "Recebido": "status-agendado",
        "Em preparo": "status-em-preparo",
        "Saiu para entrega": "status-saiu-para-entrega",
        "Entregue": "status-entregue",
        "Cancelado": "status-cancelado"
      })[status] || "status-agendado";
    },
    // Exibe uma mensagem temporária na tela.
    toast(message) {
      const toast = document.querySelector("#toast");
      if (!toast) return;
      toast.textContent = message;
      toast.classList.remove("hidden");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.add("hidden"), 3600);
    },
    // Ordena os pedidos por data e horário.
    sortAppointments(list) {
      return [...list].sort((a, b) => {
        if (a.type === "presencial" || b.type === "presencial") {
          if (a.type !== b.type) return a.type === "buffet" ? -1 : 1;
          return String(a.orderedAt || a.createdAt || "").localeCompare(String(b.orderedAt || b.createdAt || ""));
        }
        return `${a.date || ""}T${a.time || ""}`.localeCompare(`${b.date || ""}T${b.time || ""}`);
      });
    }
  };
})(window);
