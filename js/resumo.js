/* Preparação dos totais de produção, faturamento e entregas do dia. */
(function (window) {
  const App = window.App = window.App || {};

  App.Resumo = {
    // Agrupa a produção e soma os recebimentos do dia escolhido.
    build(dateISO, appointments) {
      const daily = App.Utils.sortAppointments(
        appointments.filter(item => item.date === dateISO && item.status !== "Cancelado")
      );
      const flavors = new Map();
      daily.forEach(item => item.pizzas.forEach(pizza => {
        const key = `${pizza.flavor}|${pizza.size}`;
        flavors.set(key, (flavors.get(key) || 0) + (Number(pizza.quantity) || 0));
      }));
      return {
        date: dateISO,
        deliveries: daily,
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
