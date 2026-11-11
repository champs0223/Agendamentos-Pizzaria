/* Preparação dos totais de produção, faturamento e entregas do dia. */
(function (window) {
  const App = window.App = window.App || {};

  App.Resumo = {
    // Agrupa a produção e soma os recebimentos do dia escolhido.
    build(dateISO, appointments, type = "all") {
      const daily = App.Utils.sortAppointments(appointments.filter(item =>
        (type === "all" || item.type === type) &&
        (item.type === "presencial" ? item.orderedAt.slice(0, 10) : item.date) === dateISO &&
        item.status !== "Cancelado"
      ));
      const flavors = new Map();
      daily.forEach(item => item.pizzas.forEach(pizza => {
        const key = `${pizza.flavor}|${pizza.size}`;
        flavors.set(key, (flavors.get(key) || 0) + (Number(pizza.quantity) || 0));
      }));
      return {
        date: dateISO,
        deliveries: daily,
        buffetRevenue: daily.filter(item => item.type === "buffet").reduce((sum, item) => sum + (Number(item.total) || 0), 0),
        presentialRevenue: daily.filter(item => item.type === "presencial").reduce((sum, item) => sum + (Number(item.total) || 0), 0),
        flavors: [...flavors.entries()].map(([key, quantity]) => {
          const [flavor, size] = key.split("|");
          return { flavor, size, quantity };
        }),
        pizzaCount: [...flavors.values()].reduce((sum, quantity) => sum + quantity, 0),
        revenue: daily.reduce((sum, item) => sum + (Number(item.total) || 0), 0),
        received: daily.reduce((sum, item) => sum + (Number(item.deposit) || 0), 0)
      };
    }
  };
})(window);
