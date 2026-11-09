/* Busca por cliente e seleção de período para os agendamentos. */
(function (window) {
  const App = window.App = window.App || {};

  App.Filtros = {
    // Aplica busca, situação e período à lista de pedidos.
    filter(appointments, values) {
      const query = String(values.query || "").trim().toLocaleLowerCase("pt-BR");
      const status = values.status || "all";
      return App.Utils.sortAppointments(appointments).filter(item => {
        const searchable = `${item.name || ""} ${item.phone || ""}`.toLocaleLowerCase("pt-BR");
        return searchable.includes(query) &&
          (status === "all" || item.status === status) &&
          this.matchesDate(item, values);
      });
    },
    // Verifica se a data do pedido pertence ao período escolhido.
    matchesDate(item, values) {
      const date = App.Utils.isoToDate(item.date);
      if (!date) return false;
      const today = App.Utils.isoToDate(App.Utils.todayISO());
      if (values.period === "today") return item.date === App.Utils.todayISO();
      if (values.period === "tomorrow") {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return item.date === App.Utils.todayISO(tomorrow);
      }
      if (values.period === "week") {
        const start = new Date(today);
        start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return date >= start && date <= end;
      }
      if (values.period === "custom") {
        const from = App.Utils.dateToISO(values.from);
        const to = App.Utils.dateToISO(values.to);
        return (!values.from || (!!from && item.date >= from)) &&
          (!values.to || (!!to && item.date <= to));
      }
      return true;
    }
  };
})(window);
