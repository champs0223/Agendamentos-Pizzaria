/* Renderização da interface, leitura dos formulários e eventos dos controles. */
(function (window) {
  const App = window.App = window.App || {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  let editingId = null;

  // Gera opções do cardápio organizadas por categoria.
  function menuOptions(selectedId = "") {
    const menu = App.Cardapio.getAll();
    const categories = [...new Set(menu.map(item => item.category))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const groups = categories.map(category => {
      const entries = menu.filter(item =>
        item.category === category && (item.available || item.id === selectedId)
      ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      return entries.length
        ? `<optgroup label="${App.Utils.escape(category)}">${entries.map(item =>
          `<option value="${App.Utils.escape(item.id)}" ${item.id === selectedId ? "selected" : ""}>${App.Utils.escape(item.name)}${item.available ? "" : " (indisponível)"}</option>`
        ).join("")}</optgroup>`
        : "";
    }).join("");
    return `<option value="">Selecione</option>${groups}<option value="custom" ${selectedId === "custom" ? "selected" : ""}>Outro (personalizado)</option>`;
  }

  // Cria os controles de sabor, tamanho, quantidade e preço de uma pizza.
  function addPizzaRow(pizza = {}) {
    const row = document.createElement("div");
    const menuItem = App.Cardapio.getAll().find(item =>
      (pizza.menuId && item.id === pizza.menuId) ||
      (!pizza.menuId && item.name === pizza.flavor && item.category === pizza.category)
    );
    const selection = menuItem ? menuItem.id : pizza.flavor ? "custom" : "";
    row.className = "pizza-row";
    row.innerHTML = `<div>
      <label>Sabor</label><select class="pizza-flavor-select">${menuOptions(selection)}</select>
      <div class="custom-flavor-fields ${selection === "custom" ? "" : "hidden"}"><input class="custom-name" maxlength="100" placeholder="Sabor personalizado" value="${selection === "custom" ? App.Utils.escape(pizza.flavor || "") : ""}"></div>
      <input class="pizza-flavor" type="hidden" value="${App.Utils.escape(pizza.flavor || "")}">
      <input class="pizza-category" type="hidden" value="${App.Utils.escape(pizza.category || "")}">
    </div>
    <div><label>Tamanho</label><select class="pizza-size"><option value="">Selecione</option>${["Broto", "Média", "Grande"].map(size => `<option ${pizza.size === size ? "selected" : ""}>${size}</option>`).join("")}</select></div>
    <div><label>Quantidade</label><input class="pizza-quantity" type="number" min="1" step="1" inputmode="numeric" value="${App.Utils.escape(pizza.quantity ?? 1)}"></div>
    <div><label>Preço unitário</label><input class="pizza-price" type="number" min="0" step="0.01" inputmode="decimal" value="${App.Utils.escape(pizza.unitPrice ?? "")}"></div>
    <div><label>Subtotal</label><div class="money-output pizza-subtotal">${App.Utils.money(App.Utils.itemTotal(pizza))}</div></div>
    <button type="button" class="danger remove-pizza" aria-label="Remover pizza">Remover</button>`;
    $("#pizza-items").appendChild(row);
    if (menuItem && pizza.unitPrice == null && pizza.size) {
      $(".pizza-price", row).value = menuItem.prices[pizza.size] ?? "";
    }
    updateOrderTotals();
  }

  // Atualiza preço e campos derivados quando o sabor muda.
  function syncPizzaFlavor(row, applyPrice) {
    const select = $(".pizza-flavor-select", row);
    const selected = App.Cardapio.find(select.value);
    const custom = select.value === "custom";
    $(".custom-flavor-fields", row).classList.toggle("hidden", !custom);
    if (selected) {
      $(".pizza-flavor", row).value = selected.name;
      $(".pizza-category", row).value = selected.category;
      if (applyPrice) {
        const size = $(".pizza-size", row).value;
        $(".pizza-price", row).value = size ? selected.prices[size] : "";
      }
    } else if (custom) {
      $(".pizza-flavor", row).value = $(".custom-name", row).value.trim();
      $(".pizza-category", row).value = "Personalizado";
    } else {
      $(".pizza-flavor", row).value = "";
      $(".pizza-category", row).value = "";
      $(".pizza-price", row).value = "";
    }
    updateOrderTotals();
  }

  // Lê todos os itens de pizza preenchidos no formulário.
  function pizzasFromForm() {
    return $$(".pizza-row", $("#pizza-items")).map(row => ({
      flavor: $(".pizza-flavor", row).value.trim(),
      category: $(".pizza-category", row).value || "Personalizado",
      menuId: $(".pizza-flavor-select", row).value === "custom" ? "" : $(".pizza-flavor-select", row).value,
      size: $(".pizza-size", row).value,
      quantity: Number($(".pizza-quantity", row).value),
      unitPrice: Number($(".pizza-price", row).value)
    })).filter(pizza => pizza.flavor || pizza.size || pizza.quantity > 0);
  }

  // Recalcula os subtotais e os valores do pedido em edição.
  function updateOrderTotals() {
    $$(".pizza-row", $("#pizza-items")).forEach(row => {
      const subtotal = (Number($(".pizza-quantity", row).value) || 0) *
        (Number($(".pizza-price", row).value) || 0);
      $(".pizza-subtotal", row).textContent = App.Utils.money(subtotal);
    });
    const result = App.Agendamentos.calculate(
      pizzasFromForm(), Number($("#delivery-fee").value) || 0,
      $("#discount-type").value, Number($("#discount").value) || 0
    );
    $("#subtotal-preview").textContent = App.Utils.money(result.subtotal);
    $("#total-preview").textContent = App.Utils.money(result.total);
    $("#discount-preview").textContent = App.Utils.money(result.discount);
    $("#remaining-preview").textContent = App.Utils.money(
      Math.max(0, result.total - (Number($("#deposit").value) || 0))
    );
  }

  // Limpa as mensagens de validação do formulário.
  function clearErrors() {
    $$(".field-error").forEach(node => { node.textContent = ""; });
    $("#form-alert").classList.add("hidden");
  }

  // Preenche o formulário para um pedido novo ou existente.
  function setAppointmentForm(item = null) {
    $("#appointment-form").reset();
    $("#pizza-items").innerHTML = "";
    clearErrors();
    editingId = item ? item.id : null;
    $("#form-title").textContent = item ? "Editar agendamento" : "Novo agendamento";
    $("#customer-name").value = item?.name || "";
    $("#customer-phone").value = item?.phone || "";
    $("#delivery-date").value = item?.date ? App.Utils.displayDate(item.date) : "";
    $("#delivery-time").value = item?.time || "";
    $("#people").value = item?.people || "";
    $("#status").value = item?.status || "Agendado";
    $("#street").value = item?.street || "";
    $("#number").value = item?.number || "";
    $("#neighborhood").value = item?.neighborhood || "";
    $("#complement").value = item?.complement || "";
    $("#reference").value = item?.reference || "";
    $("#notes").value = item?.notes || "";
    $("#delivery-fee").value = item?.deliveryFee ?? 0;
    $("#discount-type").value = item?.discountType || "amount";
    $("#discount").value = item?.discountValue ?? 0;
    $("#deposit").value = item?.deposit ?? 0;
    (item?.pizzas?.length ? item.pizzas : [{}]).forEach(addPizzaRow);
    updateOrderTotals();
  }

  // Lê e normaliza os campos do formulário de agendamento.
  function collectAppointment() {
    const pizzas = pizzasFromForm();
    const date = App.Utils.dateToISO($("#delivery-date").value);
    const deliveryFee = Math.max(0, Number($("#delivery-fee").value) || 0);
    const discountType = $("#discount-type").value;
    const discountValue = Math.max(0, Number($("#discount").value) || 0);
    const totals = App.Agendamentos.calculate(pizzas, deliveryFee, discountType, discountValue);
    return {
      id: editingId || App.Utils.makeId(),
      name: $("#customer-name").value.trim(),
      phone: $("#customer-phone").value.trim(),
      date: date || "",
      time: $("#delivery-time").value,
      people: $("#people").value ? Number($("#people").value) : "",
      street: $("#street").value.trim(),
      number: $("#number").value.trim(),
      neighborhood: $("#neighborhood").value.trim(),
      complement: $("#complement").value.trim(),
      reference: $("#reference").value.trim(),
      pizzas,
      notes: $("#notes").value.trim(),
      deliveryFee,
      discountType,
      discountValue,
      discountAmount: totals.discount,
      subtotal: totals.subtotal,
      total: totals.total,
      deposit: Math.max(0, Number($("#deposit").value) || 0),
      status: $("#status").value,
      createdAt: App.Agendamentos.find(editingId)?.createdAt || new Date().toISOString()
    };
  }

  // Valida e salva o agendamento atual.
  function saveAppointment(event) {
    event.preventDefault();
    const item = collectAppointment();
    const errors = App.Agendamentos.validate(item, $("#delivery-date").value);
    clearErrors();
    Object.entries(errors).forEach(([key, message]) => {
      const target = $(`#error-${key}`);
      if (target) target.textContent = message;
    });
    if (Object.keys(errors).length) return;
    if (App.Agendamentos.hasPassed(item.date, item.time) &&
      !confirm("A data e o horário escolhidos já passaram. Deseja salvar mesmo assim?")) return;
    const nearby = App.Agendamentos.near(item);
    if (nearby.length && !confirm(`Há outro agendamento a menos de 30 minutos: ${nearby.map(entry => `${entry.name} (${entry.time})`).join(", ")}. Salvar mesmo assim?`)) return;
    if (item.deposit > item.total && !confirm("O sinal informado é maior que o valor total. Deseja salvar mesmo assim?")) return;
    const isEditing = Boolean(editingId);
    if (!App.Agendamentos.save(item)) return;
    $("#appointment-dialog").close();
    App.UI.renderAll();
    App.Utils.toast(isEditing ? "Agendamento atualizado." : "Agendamento salvo.");
    editingId = null;
  }

  // Atualiza os indicadores rápidos da agenda.
  function renderMetrics() {
    const appointments = App.Agendamentos.getAll();
    const today = App.Utils.todayISO();
    const upcoming = appointments.filter(item =>
      item.date >= today && !["Cancelado", "Entregue"].includes(item.status)
    );
    $("#metric-today").textContent = appointments.filter(item =>
      item.date === today && item.status !== "Cancelado"
    ).length;
    $("#metric-upcoming").textContent = upcoming.length;
    $("#metric-balance").textContent = App.Utils.money(appointments
      .filter(item => !["Entregue", "Cancelado"].includes(item.status))
      .reduce((sum, item) => sum + App.Utils.balance(item), 0));
  }

  // Formata uma pizza para a lista de agendamentos.
  function pizzaDescription(pizza) {
    return `${App.Utils.escape(pizza.flavor)} — ${App.Utils.escape(pizza.size)} × ${App.Utils.escape(pizza.quantity)} · ${App.Utils.money(App.Utils.itemTotal(pizza))} (${App.Utils.money(pizza.unitPrice)} cada)`;
  }

  // Desenha os pedidos filtrados e suas ações disponíveis.
  function renderAppointments() {
    const appointments = App.Agendamentos.getAll();
    const filtered = App.Filtros.filter(appointments, {
      query: $("#search").value,
      status: $("#status-filter").value,
      period: $("#date-filter").value,
      from: $("#date-from").value,
      to: $("#date-to").value
    });
    const today = App.Utils.todayISO();
    $("#result-count").textContent = `${filtered.length} ${filtered.length === 1 ? "agendamento" : "agendamentos"}`;
    $("#appointment-list").innerHTML = filtered.length ? filtered.map(item => {
      const late = App.Agendamentos.hasPassed(item.date, item.time) &&
        !["Entregue", "Cancelado"].includes(item.status);
      const isToday = item.date === today;
      const address = App.Utils.address(item);
      const map = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
      const digits = String(item.phone || "").replace(/\D/g, "");
      const whatsapp = digits.startsWith("55") ? digits : `55${digits}`;
      const totals = App.Agendamentos.calculate(item.pizzas, item.deliveryFee, item.discountType, item.discountValue);
      const discount = item.discountType === "percent"
        ? `${item.discountValue}% (${App.Utils.money(totals.discount)})`
        : App.Utils.money(totals.discount);
      return `<article class="appointment ${late ? "late" : isToday ? "today" : ""}">
        <div class="card-head"><div><h3>${App.Utils.escape(item.name)}</h3><div class="card-date">${App.Utils.displayDate(item.date)} às ${App.Utils.escape(item.time)}${late ? " · <strong>Atrasado</strong>" : isToday ? " · <strong>Hoje</strong>" : ""}</div></div>
          <span class="badge ${App.Utils.statusClass(item.status)}">${App.Utils.escape(item.status || "Agendado")}</span></div>
        <div class="card-grid"><div><p><strong>Telefone:</strong> ${App.Utils.escape(item.phone)}</p><p><strong>Endereço:</strong> ${App.Utils.escape(address || "Não informado")}</p>${item.people ? `<p><strong>Pessoas:</strong> ${App.Utils.escape(item.people)}</p>` : ""}</div>
          <div><p><strong>Pizzas:</strong></p><ul>${item.pizzas.map(pizza => `<li>${pizzaDescription(pizza)}</li>`).join("")}</ul></div>
          <div><p><strong>Observações:</strong> ${App.Utils.escape(item.notes || "Nenhuma")}</p></div>
          <div><p><strong>Subtotal:</strong> ${App.Utils.money(totals.subtotal)} · <strong>Taxa:</strong> ${App.Utils.money(item.deliveryFee)} · <strong>Desconto:</strong> ${discount}</p>
            <p><strong>Total:</strong> ${App.Utils.money(item.total)} · <strong>Sinal:</strong> ${App.Utils.money(item.deposit)} · <strong>Restante:</strong> ${App.Utils.money(App.Utils.balance(item))}</p></div></div>
        <div class="card-actions"><select aria-label="Alterar status de ${App.Utils.escape(item.name)}" data-status-id="${App.Utils.escape(item.id)}">${App.Agendamentos.statuses.map(status => `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>
          <button class="secondary small-btn" data-edit="${App.Utils.escape(item.id)}" type="button">Editar</button><button class="danger small-btn" data-delete="${App.Utils.escape(item.id)}" type="button">Excluir</button>
          <button class="secondary small-btn" data-print="${App.Utils.escape(item.id)}" type="button">Imprimir comanda</button><a class="secondary small-btn" href="https://wa.me/${encodeURIComponent(whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
          ${map ? `<a class="secondary small-btn" href="${map}" target="_blank" rel="noopener noreferrer">Abrir no Maps</a>` : ""}</div>
      </article>`;
    }).join("") : '<div class="empty">Nenhum agendamento encontrado para os filtros selecionados.</div>';
    renderMetrics();
  }

  // Desenha o resumo de produção para a data selecionada.
  function renderSummary() {
    const dateISO = App.Utils.dateToISO($("#summary-date").value);
    const summary = App.Resumo.build(dateISO || "", App.Agendamentos.getAll());
    $("#summary-content").innerHTML = `<div><h3>Produção — ${dateISO ? App.Utils.displayDate(dateISO) : "data inválida"}</h3>
      <p><strong>Total de pizzas:</strong> ${summary.pizzaCount}</p><p><strong>Faturamento previsto:</strong> ${App.Utils.money(summary.revenue)}</p><p><strong>Sinais recebidos:</strong> ${App.Utils.money(summary.received)}</p>
      ${summary.flavors.length ? `<ul>${summary.flavors.map(item => `<li>${App.Utils.escape(item.flavor)} (${App.Utils.escape(item.size)}): <strong>${item.quantity}</strong></li>`).join("")}</ul>` : '<p class="muted">Nenhuma pizza agendada para esta data.</p>'}
      </div><div><h3>Entregas por horário</h3>${summary.deliveries.length ? `<ol>${summary.deliveries.map(item => `<li><strong>${App.Utils.escape(item.time)}</strong> — ${App.Utils.escape(item.name)}${App.Utils.address(item) ? ` · ${App.Utils.escape(App.Utils.address(item))}` : ""} (${item.pizzas.reduce((sum, pizza) => sum + (Number(pizza.quantity) || 0), 0)} pizzas) — ${App.Utils.money(item.total)}</li>`).join("")}</ol>` : '<p class="muted">Nenhuma entrega para esta data.</p>'}</div>`;
  }

  // Desenha a tabela de sabores e preços.
  function renderMenu() {
    const menu = App.Cardapio.getAll().sort((a, b) =>
      a.category.localeCompare(b.category, "pt-BR") || a.name.localeCompare(b.name, "pt-BR")
    );
    $("#menu-list").innerHTML = menu.map(item => `<tr class="${item.available ? "" : "unavailable"}">
      <td>${App.Utils.escape(item.category)}</td><td>${App.Utils.escape(item.name)}</td>
      <td>${App.Utils.money(item.prices.Broto)}</td><td>${App.Utils.money(item.prices["Média"])}</td><td>${App.Utils.money(item.prices.Grande)}</td>
      <td>${item.available ? "Disponível" : "Indisponível"}</td><td><div class="menu-actions">
      <button class="secondary small-btn" type="button" data-menu-edit="${App.Utils.escape(item.id)}">Editar</button>
      <button class="secondary small-btn" type="button" data-menu-toggle="${App.Utils.escape(item.id)}">${item.available ? "Indisponibilizar" : "Disponibilizar"}</button>
      <button class="danger small-btn" type="button" data-menu-delete="${App.Utils.escape(item.id)}">Excluir</button></div></td></tr>`).join("");
    $("#menu-empty").classList.toggle("hidden", menu.length > 0);
  }

  // Abre o formulário de inclusão ou edição de sabor.
  function openFlavorForm(item = null) {
    $("#flavor-form").reset();
    $("#error-flavor").textContent = "";
    $("#flavor-id").value = item?.id || "";
    $("#flavor-title").textContent = item ? "Editar sabor" : "Adicionar sabor";
    $("#flavor-name").value = item?.name || "";
    $("#flavor-category").value = item?.category || "Tradicional";
    $("#price-broto").value = item?.prices.Broto ?? "";
    $("#price-media").value = item?.prices["Média"] ?? "";
    $("#price-grande").value = item?.prices.Grande ?? "";
    $("#flavor-available").checked = item?.available !== false;
    $("#flavor-dialog").showModal();
  }

  // Valida e salva um sabor do cardápio.
  function saveFlavor(event) {
    event.preventDefault();
    const name = $("#flavor-name").value.trim();
    if (!name) {
      $("#error-flavor").textContent = "Informe o nome do sabor.";
      return;
    }
    const item = {
      id: $("#flavor-id").value || App.Utils.makeId(),
      name,
      category: $("#flavor-category").value.trim() || "Tradicional",
      prices: {
        Broto: Math.max(0, Number($("#price-broto").value) || 0),
        "Média": Math.max(0, Number($("#price-media").value) || 0),
        Grande: Math.max(0, Number($("#price-grande").value) || 0)
      },
      available: $("#flavor-available").checked
    };
    if (!App.Cardapio.save(item)) return;
    $("#flavor-dialog").close();
    renderMenu();
    $$(".pizza-row", $("#pizza-items")).forEach(row => {
      const select = $(".pizza-flavor-select", row);
      const selected = select.value;
      select.innerHTML = menuOptions(selected);
    });
    App.Utils.toast("Sabor salvo.");
  }

  // Exclui um pedido depois da confirmação.
  function deleteAppointment(id) {
    const item = App.Agendamentos.find(id);
    if (!item || !confirm(`Excluir o agendamento de ${item.name}? Esta ação não pode ser desfeita.`)) return;
    if (!App.Agendamentos.remove(id)) return;
    renderAll();
    App.Utils.toast("Agendamento excluído.");
  }

  // Abre o formulário com os dados do pedido escolhido.
  function editAppointment(id) {
    const item = App.Agendamentos.find(id);
    if (!item) return;
    setAppointmentForm(item);
    $("#appointment-dialog").showModal();
  }

  // Atualiza em conjunto a agenda e o resumo diário.
  function renderAll() {
    renderAppointments();
    renderSummary();
  }

  // Alterna entre a agenda e o gerenciamento do cardápio.
  function switchTab(tab) {
    const menuSelected = tab === "menu";
    $("#agenda-view").classList.toggle("hidden", menuSelected);
    $("#menu-view").classList.toggle("hidden", !menuSelected);
    $$(".tab").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
  }

  // Aplica a máscara brasileira ao campo de data.
  function bindDateMask(input) {
    input.addEventListener("input", () => { input.value = App.Utils.maskDate(input.value); });
  }

  // Registra os eventos dos formulários, filtros e botões.
  function bindEvents() {
    $("#new-appointment").addEventListener("click", () => {
      setAppointmentForm();
      $("#appointment-dialog").showModal();
    });
    $$("[data-close]").forEach(button => button.addEventListener("click", () => {
      $(`#${button.dataset.close}`).close();
    }));
    $("#appointment-form").addEventListener("submit", saveAppointment);
    $("#flavor-form").addEventListener("submit", saveFlavor);
    $("#add-pizza").addEventListener("click", () => addPizzaRow());
    $("#pizza-items").addEventListener("click", event => {
      const button = event.target.closest(".remove-pizza");
      if (!button) return;
      button.closest(".pizza-row").remove();
      if (!$("#pizza-items").children.length) addPizzaRow();
      updateOrderTotals();
    });
    $("#pizza-items").addEventListener("change", event => {
      const row = event.target.closest(".pizza-row");
      if (!row) return;
      if (event.target.matches(".pizza-flavor-select")) {
        syncPizzaFlavor(row, true);
      } else if (event.target.matches(".pizza-size")) {
        const item = App.Cardapio.find($(".pizza-flavor-select", row).value);
        if (item) $(".pizza-price", row).value = item.prices[event.target.value] ?? "";
        updateOrderTotals();
      } else {
        updateOrderTotals();
      }
    });
    $("#pizza-items").addEventListener("input", event => {
      const row = event.target.closest(".pizza-row");
      if (!row) return;
      if (event.target.matches(".custom-name") && $(".pizza-flavor-select", row).value === "custom") {
        $(".pizza-flavor", row).value = event.target.value.trim();
      }
      updateOrderTotals();
    });
    $("#customer-phone").addEventListener("input", event => {
      event.target.value = App.Utils.maskPhone(event.target.value);
    });
    [$("#delivery-date"), $("#date-from"), $("#date-to"), $("#summary-date")].forEach(bindDateMask);
    $("#delivery-time").addEventListener("input", event => {
      event.target.value = App.Utils.maskTime(event.target.value);
    });
    ["delivery-fee", "discount", "discount-type", "deposit"].forEach(id => {
      $(`#${id}`).addEventListener("input", updateOrderTotals);
    });
    ["search", "status-filter", "date-filter", "date-from", "date-to"].forEach(id => {
      $(`#${id}`).addEventListener("input", renderAppointments);
    });
    $("#date-filter").addEventListener("change", () => {
      $("#custom-range").classList.toggle("hidden", $("#date-filter").value !== "custom");
      renderAppointments();
    });
    $("#summary-date").addEventListener("input", () => {
      if ($("#summary-date").value.length === 10) renderSummary();
    });
    $("#appointment-list").addEventListener("click", event => {
      const edit = event.target.closest("[data-edit]");
      const remove = event.target.closest("[data-delete]");
      const print = event.target.closest("[data-print]");
      if (edit) editAppointment(edit.dataset.edit);
      if (remove) deleteAppointment(remove.dataset.delete);
      if (print) App.Comanda.print(App.Agendamentos.find(print.dataset.print));
    });
    $("#appointment-list").addEventListener("change", event => {
      if (event.target.matches("[data-status-id]")) {
        if (!App.Agendamentos.changeStatus(event.target.dataset.statusId, event.target.value)) return;
        renderAll();
        App.Utils.toast("Status atualizado.");
      }
    });
    $("#menu-list").addEventListener("click", event => {
      const edit = event.target.closest("[data-menu-edit]");
      const toggle = event.target.closest("[data-menu-toggle]");
      const remove = event.target.closest("[data-menu-delete]");
      if (edit) openFlavorForm(App.Cardapio.find(edit.dataset.menuEdit));
      if (toggle && App.Cardapio.toggle(toggle.dataset.menuToggle)) {
        renderMenu();
        App.Utils.toast("Disponibilidade atualizada.");
      }
      if (remove) {
        const item = App.Cardapio.find(remove.dataset.menuDelete);
        if (item && confirm(`Excluir o sabor ${item.name} do cardápio? Pedidos existentes não serão alterados.`) &&
          App.Cardapio.remove(item.id)) {
          renderMenu();
          App.Utils.toast("Sabor excluído do cardápio.");
        }
      }
    });
    $("#new-flavor").addEventListener("click", () => openFlavorForm());
    $("#restore-menu").addEventListener("click", () => {
      if (!confirm("Restaurar o cardápio inicial? Os sabores atuais serão substituídos.")) return;
      if (App.Cardapio.restore()) {
        renderMenu();
        App.Utils.toast("Cardápio inicial restaurado.");
      }
    });
    $$(".tab").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.tab)));
    $("#export-json").addEventListener("click", () => App.Backup.exportJSON());
    $("#export-csv").addEventListener("click", () => App.Backup.exportCSV());
    $("#import-json").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", event => App.Backup.importFile(event.target.files[0]));
  }

  App.UI = {
    // Ativa os eventos da interface.
    init: bindEvents,
    // Atualiza lista, resumo e indicadores.
    renderAll,
    // Atualiza a tabela do cardápio.
    renderMenu,
    // Acrescenta uma linha de pizza ao formulário.
    addPizzaRow
  };
})(window);
