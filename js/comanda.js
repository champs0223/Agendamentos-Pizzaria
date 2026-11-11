/* Montagem e impressão de uma comanda individual. */
(function (window) {
  const App = window.App = window.App || {};

  App.Comanda = {
    // Monta os dados da comanda com texto escapado.
    render(item) {
      const utils = App.Utils;
      const totals = App.Agendamentos.calculate(item.pizzas, item.deliveryFee, item.discountType, item.discountValue);
      const discount = item.discountType === "percent"
        ? `${item.discountValue}% (${utils.money(totals.discount)})`
        : utils.money(totals.discount);
      const presencial = item.type === "presencial";
      return `<h1>Forno &amp; Festa — Comanda de ${presencial ? "pedido do dia" : "buffet agendado"}</h1>
        <p><strong>Cliente:</strong> ${utils.escape(item.name)}</p>
        <p><strong>Telefone:</strong> ${utils.escape(item.phone)}</p>
        <p>${presencial
          ? `<strong>Pedido nº:</strong> ${utils.escape(item.orderNumber)} &nbsp; <strong>Feito em:</strong> ${utils.displayDate(item.orderedAt.slice(0, 10))} às ${utils.escape(item.orderedAt.slice(11, 16))}`
          : `<strong>Data:</strong> ${utils.displayDate(item.date)} &nbsp; <strong>Horário:</strong> ${utils.escape(item.time)}`}</p>
        <p><strong>Endereço:</strong> ${utils.escape(utils.address(item) || "Não informado")}</p>
        <h2>Pizzas</h2><table><thead><tr><th>Sabor</th><th>Tamanho</th><th>Quantidade</th><th>Preço unitário</th><th>Subtotal</th></tr></thead>
        <tbody>${item.pizzas.map(pizza => `<tr><td>${utils.escape(pizza.flavor)}</td><td>${utils.escape(pizza.size)}</td><td>${utils.escape(pizza.quantity)}</td><td>${utils.money(pizza.unitPrice)}</td><td>${utils.money(utils.itemTotal(pizza))}</td></tr>`).join("")}</tbody></table>
        <p><strong>Subtotal:</strong> ${utils.money(totals.subtotal)} · <strong>Taxa:</strong> ${utils.money(item.deliveryFee)} · <strong>Desconto:</strong> ${discount}</p>
        <p><strong>Total:</strong> ${utils.money(item.total)}${presencial
          ? ` · <strong>Pagamento:</strong> ${utils.escape(item.paymentForm || "Pendente")}`
          : ` · <strong>Sinal:</strong> ${utils.money(item.deposit)} · <strong>Restante:</strong> ${utils.money(utils.balance(item))}`}</p>
        <h2>Observações</h2><p>${utils.escape(item.notes || "Nenhuma")}</p>`;
    },
    // Abre a caixa de impressão do navegador.
    print(item) {
      if (!item) return;
      App.Utils.$("#print-root").innerHTML = this.render(item);
      window.print();
    }
  };
})(window);
