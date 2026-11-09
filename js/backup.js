/* Exportação e importação de backup JSON e planilha CSV. */
(function (window) {
  const App = window.App = window.App || {};

  // Cria o download local de um arquivo.
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Protege delimitadores de campo do arquivo CSV.
  function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  App.Backup = {
    // Baixa pedidos e cardápio em um único JSON.
    exportJSON() {
      try {
        download(`agendamentos-pizzaria-${App.Utils.todayISO()}.json`, JSON.stringify({
          format: "forno-festa-backup-v2",
          appointments: App.Agendamentos.getAll(),
          menu: App.Cardapio.getAll()
        }, null, 2), "application/json;charset=utf-8");
      } catch (error) {
        console.error("Falha ao exportar JSON.", error);
        App.Utils.toast("Não foi possível exportar o arquivo JSON.");
      }
    },
    // Baixa a lista de pedidos no formato CSV.
    exportCSV() {
      const utils = App.Utils;
      const header = ["Cliente", "Telefone", "Data", "Horário", "Endereço", "Pizzas",
        "Observações", "Taxa", "Desconto", "Total", "Sinal pago", "Restante", "Status"];
      const rows = utils.sortAppointments(App.Agendamentos.getAll()).map(item => [
        item.name, item.phone, utils.displayDate(item.date), item.time, utils.address(item),
        item.pizzas.map(pizza => `${pizza.flavor} (${pizza.size}) x ${pizza.quantity} @ ${utils.money(pizza.unitPrice)} = ${utils.money(utils.itemTotal(pizza))}`).join("; "),
        item.notes, item.deliveryFee, item.discountAmount, item.total, item.deposit, utils.balance(item), item.status
      ]);
      try {
        download(`agendamentos-pizzaria-${utils.todayISO()}.csv`, "\uFEFF" +
          [header, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
      } catch (error) {
        console.error("Falha ao exportar CSV.", error);
        utils.toast("Não foi possível exportar o arquivo CSV.");
      }
    },
    // Lê um backup antigo ou atual e substitui os dados após confirmação.
    importFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          const legacy = Array.isArray(parsed);
          const orders = legacy ? parsed : parsed?.appointments;
          const rawMenu = legacy ? null : parsed?.menu;
          if (!Array.isArray(orders) || orders.some(item => !item || typeof item !== "object" || !Array.isArray(item.pizzas))) {
            throw new Error("O arquivo não contém uma lista válida de agendamentos.");
          }
          const imported = orders.map(item => App.Agendamentos.normalize({
            ...item,
            id: String(item.id || App.Utils.makeId()),
            pizzas: item.pizzas.map(pizza => ({ ...pizza, unitPrice: Number(pizza.unitPrice) || 0 }))
          }));
          const importedMenu = Array.isArray(rawMenu)
            ? rawMenu.map(item => App.Cardapio.normalize(item))
            : App.Cardapio.getAll();
          const menuIncluded = Array.isArray(rawMenu);
          if (!confirm(`Importar ${imported.length} agendamento(s)${menuIncluded ? " e cardápio" : ""} e substituir os dados atuais?`)) return;
          if (!App.Agendamentos.replace(imported)) return;
          if (menuIncluded && !App.Cardapio.replace(importedMenu)) return;
          App.UI.renderAll();
          App.UI.renderMenu();
          App.Utils.toast("Dados importados com sucesso.");
        } catch (error) {
          console.error("Falha ao importar o arquivo.", error);
          App.Utils.toast(`Arquivo inválido: ${error.message || "não foi possível ler os dados."}`);
        } finally {
          App.Utils.$("#import-file").value = "";
        }
      };
      reader.onerror = () => {
        App.Utils.toast("Não foi possível ler o arquivo selecionado.");
        App.Utils.$("#import-file").value = "";
      };
      reader.readAsText(file);
    }
  };
})(window);
