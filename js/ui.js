/* Renderização da interface, leitura dos formulários e eventos dos controles. */
(function (window) {
  const App = window.App = window.App || {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const sizes = ["Broto", "Média", "Grande"];
  let editingId = null;
  let activeType = "presencial";
  let pizzaSelections = [];
  let customSelections = [];
  let statusByType = { presencial: "Recebido", buffet: "Agendado" };
  let undoTimer = null;
  let undoItem = null;

  function selectedPizza(menuId, size) {
    return pizzaSelections.find(pizza => pizza.menuId === menuId && pizza.size === size);
  }

  function renderPizzaMenu() {
    const query = $("#pizza-search").value.trim().toLocaleLowerCase("pt-BR");
    const available = App.Cardapio.getAll().filter(item => item.available &&
      `${item.name} ${item.category}`.toLocaleLowerCase("pt-BR").includes(query)
    ).sort((a, b) => a.category.localeCompare(b.category, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));
    let category = "";
    $("#pizza-menu-list").innerHTML = available.map(item => {
      const heading = item.category !== category
        ? `<tr class="category-row"><th colspan="4">${App.Utils.escape(item.category)}</th></tr>`
        : "";
      category = item.category;
      const cells = sizes.map(size => {
        const selected = selectedPizza(item.id, size);
        const quantity = selected ? selected.quantity : 0;
        return `<td><div class="pizza-size-choice"><span class="size-name">${size}</span><span class="pizza-price-label">${App.Utils.money(item.prices[size])}</span>
          <div class="quantity-control"><button type="button" class="quantity-button" data-quantity-step="-1" data-menu-id="${App.Utils.escape(item.id)}" data-size="${size}" aria-label="Diminuir ${App.Utils.escape(item.name)} ${size}">−</button>
          <input type="number" min="0" step="1" inputmode="numeric" value="${quantity}" data-menu-quantity data-menu-id="${App.Utils.escape(item.id)}" data-size="${size}" aria-label="Quantidade de ${App.Utils.escape(item.name)} ${size}">
          <button type="button" class="quantity-button" data-quantity-step="1" data-menu-id="${App.Utils.escape(item.id)}" data-size="${size}" aria-label="Aumentar ${App.Utils.escape(item.name)} ${size}">+</button></div></div></td>`;
      }).join("");
      const active = sizes.some(size => (selectedPizza(item.id, size)?.quantity || 0) > 0);
      return `${heading}<tr class="flavor-row ${active ? "selected-flavor" : ""}"><th>${App.Utils.escape(item.name)}</th>${cells}</tr>`;
    }).join("") || '<tr><td colspan="4" class="muted">Nenhum sabor disponível encontrado.</td></tr>';
  }

  function addCustomPizza(pizza = {}) {
    customSelections.push({
      key: App.Utils.makeId(),
      flavor: pizza.flavor || "",
      size: pizza.size || "",
      quantity: Number(pizza.quantity) || 0,
      unitPrice: Number(pizza.unitPrice) || 0
    });
    renderCustomPizzas();
    updateOrderTotals();
  }

  function renderCustomPizzas() {
    $("#custom-pizza-list").innerHTML = customSelections.map(pizza => `<div class="custom-pizza-row" data-custom-key="${App.Utils.escape(pizza.key)}">
      <label>Outro sabor (personalizado)<input type="text" maxlength="100" placeholder="Nome do sabor" data-custom-field="flavor" value="${App.Utils.escape(pizza.flavor)}"></label>
      <label>Tamanho<select data-custom-field="size"><option value="">Tamanho</option>${sizes.map(size => `<option ${pizza.size === size ? "selected" : ""}>${size}</option>`).join("")}</select></label>
      <label>Preço unitário (R$)<input type="number" min="0" step="0.01" inputmode="decimal" data-custom-field="unitPrice" value="${pizza.unitPrice || ""}"></label>
      <label>Quantidade<input type="number" min="0" step="1" inputmode="numeric" data-custom-field="quantity" value="${pizza.quantity}"></label>
      <button type="button" class="danger small-btn" data-remove-custom="${App.Utils.escape(pizza.key)}">Remover</button>
    </div>`).join("");
  }

  function pizzasFromForm() {
    const menuPizzas = pizzaSelections.filter(pizza => pizza.quantity > 0).map(pizza => ({ ...pizza }));
    const customPizzas = customSelections.filter(pizza => pizza.quantity > 0 || pizza.flavor || pizza.size).map(pizza => ({
      flavor: pizza.flavor.trim(), category: "Personalizado", menuId: "", size: pizza.size,
      quantity: pizza.quantity, unitPrice: pizza.unitPrice
    }));
    return [...menuPizzas, ...customPizzas];
  }

  function updateOrderTotals() {
    const pizzas = pizzasFromForm();
    const subtotal = pizzas.reduce((sum, pizza) => sum + App.Utils.itemTotal(pizza), 0);
    const totals = App.Agendamentos.calculate(pizzas, Number($("#delivery-fee").value) || 0,
      $("#discount-type").value, Number($("#discount").value) || 0);
    $("#subtotal-preview").textContent = App.Utils.money(subtotal);
    $("#total-preview").textContent = App.Utils.money(totals.total);
    $("#discount-preview").textContent = App.Utils.money(totals.discount);
    $("#remaining-preview").textContent = App.Utils.money(Math.max(0, totals.total - (Number($("#deposit").value) || 0)));
    $("#pizza-count").textContent = String(pizzas.reduce((sum, pizza) => sum + (Number(pizza.quantity) || 0), 0));
    $("#items-total").textContent = App.Utils.money(subtotal);
    $("#selected-items").innerHTML = pizzas.length ? `<ul>${pizzas.map(pizza =>
      `<li>${App.Utils.escape(pizza.quantity)}x ${App.Utils.escape(pizza.flavor)} ${App.Utils.escape(pizza.size)} — ${App.Utils.money(App.Utils.itemTotal(pizza))}</li>`
    ).join("")}</ul>` : '<p class="muted">Nenhum item selecionado.</p>';
  }

  function clearErrors() {
    $$(".field-error").forEach(node => { node.textContent = ""; });
    $("#form-alert").classList.add("hidden");
  }

  function setOrderType(type) {
    activeType = type === "presencial" ? "presencial" : "buffet";
    $("#order-type").value = activeType;
    $$(".buffet-only").forEach(node => node.classList.toggle("hidden", activeType !== "buffet"));
    $$(".presential-only").forEach(node => node.classList.toggle("hidden", activeType !== "presencial"));
    $$("[data-order-type]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.orderType === activeType));
      button.disabled = Boolean(editingId);
    });
    $("#form-title").textContent = editingId ? "Editar pedido" : "Novo pedido";
    $("#status").innerHTML = (activeType === "buffet" ? ["Agendado", "Em preparo", "Saiu para entrega", "Entregue", "Cancelado"] : App.Agendamentos.presentialStatuses)
      .map(status => `<option>${status}</option>`).join("");
    $("#status").value = statusByType[activeType] || (activeType === "buffet" ? "Agendado" : "Recebido");
    $("#order-number-display").textContent = String(
      App.Agendamentos.find(editingId)?.orderNumber || nextOrderNumber(App.Utils.todayISO())
    );
    if (activeType === "buffet") $("#order-number-display").textContent = "";
  }

  function setAppointmentForm(item = null, type = activeType) {
    $("#appointment-form").reset();
    clearErrors();
    editingId = item ? item.id : null;
    setOrderType(item ? item.type : type);
    $("#customer-name").value = item?.name || "";
    $("#customer-phone").value = item?.phone || "";
    $("#delivery-date").value = item?.date ? App.Utils.displayDate(item.date) : "";
    $("#delivery-time").value = item?.time || "";
    $("#people").value = item?.people || "";
    const defaultStatus = activeType === "buffet" ? "Agendado" : "Recebido";
    $("#status").value = item?.status && Array.from($("#status").options).some(option => option.value === item.status)
      ? item.status : defaultStatus;
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
    $("#payment-form").value = item?.paymentForm || "Pendente";
    $("#eta-minutes").value = item?.etaMinutes ?? "";
    pizzaSelections = [];
    customSelections = [];
    (item?.pizzas || []).forEach(pizza => {
      const menuItem = App.Cardapio.find(pizza.menuId) || App.Cardapio.getAll().find(entry =>
        entry.name === pizza.flavor && entry.category === pizza.category
      );
      if (menuItem) {
        const existing = selectedPizza(menuItem.id, pizza.size);
        if (existing) {
          const previousQuantity = Number(existing.quantity) || 0;
          const addedQuantity = Number(pizza.quantity) || 0;
          const combinedQuantity = previousQuantity + addedQuantity;
          existing.unitPrice = combinedQuantity
            ? (existing.unitPrice * previousQuantity + (Number(pizza.unitPrice) || 0) * addedQuantity) / combinedQuantity
            : 0;
          existing.quantity = combinedQuantity;
        } else {
          pizzaSelections.push({ ...pizza, menuId: menuItem.id });
        }
      } else {
        addCustomPizza(pizza);
      }
    });
    renderPizzaMenu();
    renderCustomPizzas();
    updateOrderTotals();
  }

  function nextOrderNumber(date) {
    return App.Agendamentos.getAll().filter(item => item.type === "presencial" &&
      item.orderedAt.slice(0, 10) === date
    ).reduce((max, item) => Math.max(max, Number(item.orderNumber) || 0), 0) + 1;
  }

  function collectAppointment() {
    const type = $("#order-type").value;
    const previous = App.Agendamentos.find(editingId);
    const pizzas = pizzasFromForm();
    const date = type === "buffet" ? App.Utils.dateToISO($("#delivery-date").value) : "";
    const deliveryFee = Math.max(0, Number($("#delivery-fee").value) || 0);
    const discountType = $("#discount-type").value;
    const discountValue = Math.max(0, Number($("#discount").value) || 0);
    const totals = App.Agendamentos.calculate(pizzas, deliveryFee, discountType, discountValue);
    const orderedAt = type === "presencial"
      ? (previous?.type === "presencial" ? previous.orderedAt : App.Utils.localDateTime())
      : (previous?.orderedAt || App.Utils.localDateTime());
    const orderDate = orderedAt.slice(0, 10) || App.Utils.todayISO();
    return {
      ...(previous || {}),
      id: editingId || App.Utils.makeId(),
      type,
      name: $("#customer-name").value.trim(),
      phone: $("#customer-phone").value.trim(),
      date: date || "",
      time: type === "buffet" ? $("#delivery-time").value : "",
      people: type === "buffet" && $("#people").value ? Number($("#people").value) : "",
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
      deposit: type === "buffet" ? Math.max(0, Number($("#deposit").value) || 0) : 0,
      paymentForm: $("#payment-form").value,
      etaMinutes: type === "presencial" ? ($("#eta-minutes").value ? Number($("#eta-minutes").value) : "") : "",
      status: $("#status").value,
      orderedAt,
      orderNumber: type === "presencial" ? (previous?.type === "presencial" ? previous.orderNumber : nextOrderNumber(orderDate)) : 0,
      createdAt: previous?.createdAt || new Date().toISOString()
    };
  }

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
    if (item.type === "buffet" && App.Agendamentos.hasPassed(item.date, item.time) &&
      !confirm("A data e o horário escolhidos já passaram. Deseja salvar mesmo assim?")) return;
    if (item.type === "buffet") {
      const nearby = App.Agendamentos.near(item);
      if (nearby.length && !confirm(`Há outro agendamento a menos de 30 minutos: ${nearby.map(entry => `${entry.name} (${entry.time})`).join(", ")}. Salvar mesmo assim?`)) return;
      if (item.deposit > item.total && !confirm("O sinal informado é maior que o valor total. Deseja salvar mesmo assim?")) return;
    }
    const isEditing = Boolean(editingId);
    if (!App.Agendamentos.save(item)) return;
    $("#appointment-dialog").close();
    renderAll();
    App.Utils.toast(isEditing ? "Pedido atualizado." : "Pedido salvo.");
    editingId = null;
  }

  function renderMetrics() {
    const appointments = App.Agendamentos.getAll().filter(item => item.type === "buffet");
    const today = App.Utils.todayISO();
    const upcoming = appointments.filter(item =>
      item.date > today && !["Cancelado", "Entregue"].includes(item.status)
    );
    $("#metric-today").textContent = appointments.filter(item =>
      item.date === today && item.status !== "Cancelado"
    ).length;
    $("#metric-upcoming").textContent = upcoming.length;
    $("#metric-balance").textContent = App.Utils.money(appointments
      .filter(item => !["Entregue", "Cancelado"].includes(item.status))
      .reduce((sum, item) => sum + App.Utils.balance(item), 0));
  }

  function pizzaDescription(pizza) {
    return `${App.Utils.escape(pizza.flavor)} — ${App.Utils.escape(pizza.size)} × ${App.Utils.escape(pizza.quantity)} · ${App.Utils.money(App.Utils.itemTotal(pizza))} (${App.Utils.money(pizza.unitPrice)} cada)`;
  }

  function compactItems(item) {
    return item.pizzas.map(pizza => `${pizza.quantity}x ${pizza.flavor} ${pizza.size}`).join(", ");
  }

  function advanceStatus(item) {
    const sequence = item.type === "presencial"
      ? ["Recebido", "Em preparo", "Saiu para entrega", "Entregue"]
      : ["Agendado", "Em preparo", "Saiu para entrega", "Entregue"];
    const currentIndex = sequence.indexOf(item.status);
    if (currentIndex < 0 || currentIndex >= sequence.length - 1) return;
    const next = sequence[currentIndex + 1];
    if (!App.Agendamentos.changeStatus(item.id, next)) return;
    if (next === "Entregue") showUndo(item, item.status);
    renderAll();
  }

  function showUndo(item, previousStatus) {
    undoItem = { id: item.id, previousStatus };
    $("#undo-notice").classList.remove("hidden");
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      $("#undo-notice").classList.add("hidden");
      undoItem = null;
    }, 7000);
  }

  function undoDelivery() {
    if (!undoItem) return;
    const item = App.Agendamentos.find(undoItem.id);
    if (item && item.status === "Entregue") {
      if (!App.Agendamentos.changeStatus(item.id, undoItem.previousStatus)) return;
      renderAll();
    }
    undoItem = null;
    clearTimeout(undoTimer);
    $("#undo-notice").classList.add("hidden");
  }

  function kitchenCard(item, kind) {
    const isPresential = item.type === "presencial";
    const address = App.Utils.address(item);
    const total = App.Utils.money(item.total);
    const balance = App.Utils.money(App.Utils.balance(item));
    const moment = isPresential
      ? `#${item.orderNumber} · ${item.orderedAt.slice(11, 16)}`
      : `${App.Utils.escape(item.time)} · ${App.Utils.escape(item.name)}`;
    const waitMinutes = isPresential
      ? Math.max(0, Math.floor((Date.now() - new Date(item.orderedAt).getTime()) / 60000))
      : 0;
    const status = isPresential ? ["Recebido", "Em preparo", "Saiu para entrega", "Entregue"] :
      ["Agendado", "Em preparo", "Saiu para entrega", "Entregue"];
    const nextLabel = {
      Recebido: "Iniciar preparo",
      Agendado: "Iniciar preparo",
      "Em preparo": "Saiu para entrega",
      "Saiu para entrega": "Marcar como entregue"
    }[item.status];
    const now = new Date();
    const deliveryAt = new Date(`${item.date}T${item.time || "00:00"}:00`);
    const minutesUntil = (deliveryAt.getTime() - now.getTime()) / 60000;
    const warning = kind === "day"
      ? waitMinutes > 40 && !["Saiu para entrega", "Entregue"].includes(item.status)
      : minutesUntil < 0 ? "overdue" : minutesUntil < 60 ? "nearby" : "";
    const classes = ["kitchen-card", warning === true ? "waiting-long" : warning].filter(Boolean).join(" ");
    const button = nextLabel ? `<button type="button" class="primary advance-status" data-advance="${App.Utils.escape(item.id)}">${nextLabel}</button>` : "";
    return `<details class="${classes}"><summary><span class="kitchen-moment">${moment}</span>${isPresential ? `<span class="kitchen-customer">${App.Utils.escape(item.name)}</span>` : ""}
        <span class="kitchen-items">${App.Utils.escape(compactItems(item))}</span>${item.notes ? `<span class="kitchen-note">${App.Utils.escape(item.notes)}</span>` : ""}${warning === "nearby" ? '<span class="kitchen-alert">Próximo</span>' : warning === "overdue" ? '<span class="kitchen-alert">Atrasado</span>' : warning ? `<span class="kitchen-alert">Espera: ${waitMinutes} min</span>` : ""}</summary>
      <div class="kitchen-details"><p><strong>Cliente:</strong> ${App.Utils.escape(item.name)} · <strong>Telefone:</strong> ${App.Utils.escape(item.phone)}</p>
        <p><strong>Endereço:</strong> ${App.Utils.escape(address || "Não informado")}</p>${isPresential
        ? `<p><strong>Total:</strong> ${total} · <strong>Pagamento:</strong> ${App.Utils.escape(item.paymentForm || "Pendente")}</p>`
        : `<p><strong>Pessoas:</strong> ${App.Utils.escape(item.people || "—")} · <strong>Restante:</strong> ${balance}</p>`}
        ${button}</div></details>`;
  }

  function renderKitchen() {
    const all = App.Agendamentos.getAll();
    const today = App.Utils.todayISO();
    const actionable = all.filter(item => !["Entregue", "Cancelado"].includes(item.status));
    const dayOrders = actionable.filter(item => item.type === "presencial" && item.orderedAt.slice(0, 10) === today)
      .sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
    const todayBuffets = actionable.filter(item => item.type === "buffet" && item.date === today)
      .sort((a, b) => a.time.localeCompare(b.time));
    const upcoming = actionable.filter(item => item.type === "buffet" && item.date > today)
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    const production = new Map();
    actionable.filter(item => (item.type === "buffet" ? item.date : item.orderedAt.slice(0, 10)) === today)
      .forEach(item => item.pizzas.forEach(pizza => {
        const key = `${pizza.flavor}|${pizza.size}`;
        production.set(key, (production.get(key) || 0) + (Number(pizza.quantity) || 0));
      }));
    const count = [...production.values()].reduce((sum, quantity) => sum + quantity, 0);
    $("#production-count").textContent = `${count} ${count === 1 ? "pizza" : "pizzas"}`;
    $("#production-flavors").innerHTML = production.size
      ? `<ul>${[...production.entries()].map(([key, quantity]) => {
        const [flavor, size] = key.split("|");
        return `<li>${App.Utils.escape(flavor)} (${App.Utils.escape(size)}): <strong>${quantity}</strong></li>`;
      }).join("")}</ul>`
      : '<p class="muted">Nenhum item pendente para hoje.</p>';
    $("#today-orders-count").textContent = String(dayOrders.length);
    $("#today-buffets-count").textContent = String(todayBuffets.length);
    $("#today-orders").innerHTML = dayOrders.length
      ? dayOrders.map(item => kitchenCard(item, "day")).join("")
      : '<div class="empty">Nenhum pedido do dia aguardando.</div>';
    $("#today-buffets").innerHTML = todayBuffets.length
      ? todayBuffets.map(item => kitchenCard(item, "buffet")).join("")
      : '<div class="empty">Nenhum buffet pendente para hoje.</div>';
    $("#upcoming-buffets").innerHTML = upcoming.length
      ? upcoming.map(item => `<div class="upcoming-card"><strong>${App.Utils.displayDate(item.date)} · ${App.Utils.escape(item.time)}</strong> — ${App.Utils.escape(item.name)} <span class="muted">(${item.pizzas.reduce((sum, pizza) => sum + (Number(pizza.quantity) || 0), 0)} pizzas · ${App.Utils.money(item.total)})</span></div>`).join("")
      : '<p class="muted">Nenhum buffet futuro.</p>';
    renderMetrics();
  }

  function orderTimestamp(item) {
    return item.type === "presencial"
      ? new Date(item.orderedAt).getTime()
      : new Date(`${item.date}T${item.time || "00:00"}:00`).getTime();
  }

  function creationTimestamp(item) {
    const recorded = new Date(item.createdAt || item.orderedAt || "").getTime();
    return Number.isFinite(recorded) ? recorded : orderTimestamp(item) || 0;
  }

  function renderAppointments() {
    const filtered = App.Filtros.filter(App.Agendamentos.getAll(), {
      query: $("#search").value,
      status: $("#status-filter").value,
      period: $("#date-filter").value,
      from: $("#date-from").value,
      to: $("#date-to").value,
    });
    const type = $("#type-filter").value;
    const orders = filtered.filter(item => type === "all" || item.type === type);
    orders.sort((a, b) => $("#sort-orders").value === "delivery"
      ? orderTimestamp(a) - orderTimestamp(b)
      : creationTimestamp(b) - creationTimestamp(a));
    $("#result-count").textContent = `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}`;
    $("#appointment-list").innerHTML = orders.length ? orders.map(item => {
      const isPresential = item.type === "presencial";
      const time = isPresential ? item.orderedAt.slice(11, 16) : item.time;
      const date = isPresential ? item.orderedAt.slice(0, 10) : item.date;
      const waitMinutes = isPresential ? Math.max(0, Math.floor((Date.now() - new Date(item.orderedAt).getTime()) / 60000)) : 0;
      const waiting = isPresential && !["Saiu para entrega", "Entregue", "Cancelado"].includes(item.status);
      const late = isPresential ? waiting && waitMinutes >= 40 : App.Agendamentos.hasPassed(item.date, item.time) &&
        !["Entregue", "Cancelado"].includes(item.status);
      const address = App.Utils.address(item);
      const map = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
      const digits = String(item.phone || "").replace(/\D/g, "");
      const whatsapp = digits.startsWith("55") ? digits : `55${digits}`;
      const totals = App.Agendamentos.calculate(item.pizzas, item.deliveryFee, item.discountType, item.discountValue);
      const discount = item.discountType === "percent"
        ? `${item.discountValue}% (${App.Utils.money(totals.discount)})`
        : App.Utils.money(totals.discount);
      const orderMoment = isPresential
        ? `Comanda nº ${item.orderNumber} · ${App.Utils.displayDate(date)} às ${App.Utils.escape(time)}${item.etaMinutes ? ` · previsão ${App.Utils.escape(App.Utils.addMinutes(item.orderedAt, item.etaMinutes))}` : ""}`
        : `${App.Utils.displayDate(date)} às ${App.Utils.escape(time)}`;
      const statusOptions = (isPresential ? App.Agendamentos.presentialStatuses :
        ["Agendado", "Em preparo", "Saiu para entrega", "Entregue", "Cancelado"]).map(status =>
        `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("");
      return `<article class="appointment ${late ? "late" : ""}">
        <div class="card-head"><div><h3>${App.Utils.escape(item.name)}</h3><div class="card-date">${orderMoment}${late ? ` · <strong>${isPresential ? `Aguardando há ${waitMinutes} min` : "Atrasado"}</strong>` : ""}</div></div>
          <div class="card-badges"><span class="type-badge ${isPresential ? "type-presential" : "type-buffet"}">${isPresential ? "Pedido do dia" : "Buffet"}</span><span class="badge ${App.Utils.statusClass(item.status)}">${App.Utils.escape(item.status || (isPresential ? "Recebido" : "Agendado"))}</span></div></div>
        <div class="card-grid"><div><p><strong>Telefone:</strong> ${App.Utils.escape(item.phone)}</p><p><strong>Endereço:</strong> ${App.Utils.escape(address || "Não informado")}</p>${!isPresential && item.people ? `<p><strong>Pessoas:</strong> ${App.Utils.escape(item.people)}</p>` : ""}${isPresential ? `<p><strong>Pagamento:</strong> ${App.Utils.escape(item.paymentForm || "Pendente")}${waiting ? ` · <strong>Espera:</strong> ${waitMinutes} min` : ""}</p>` : ""}</div>
          <div><p><strong>Pizzas:</strong></p><ul>${item.pizzas.map(pizza => `<li>${pizzaDescription(pizza)}</li>`).join("")}</ul></div>
          <div><p><strong>Observações:</strong> ${App.Utils.escape(item.notes || "Nenhuma")}</p></div>
          <div><p><strong>Subtotal:</strong> ${App.Utils.money(totals.subtotal)} · <strong>Taxa:</strong> ${App.Utils.money(item.deliveryFee)} · <strong>Desconto:</strong> ${discount}</p>
            <p><strong>Total:</strong> ${App.Utils.money(item.total)}${isPresential ? "" : ` · <strong>Sinal:</strong> ${App.Utils.money(item.deposit)} · <strong>Restante:</strong> ${App.Utils.money(App.Utils.balance(item))}`}</p></div></div>
        <div class="card-actions"><select aria-label="Alterar status de ${App.Utils.escape(item.name)}" data-status-id="${App.Utils.escape(item.id)}">${statusOptions}</select>
          <button class="secondary small-btn" data-edit="${App.Utils.escape(item.id)}" type="button">Editar</button><button class="danger small-btn" data-delete="${App.Utils.escape(item.id)}" type="button">Excluir</button>
          <button class="secondary small-btn" data-print="${App.Utils.escape(item.id)}" type="button">Imprimir comanda</button><a class="secondary small-btn" href="https://wa.me/${encodeURIComponent(whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
          ${map ? `<a class="secondary small-btn" href="${map}" target="_blank" rel="noopener noreferrer">Abrir no Maps</a>` : ""}</div>
      </article>`;
    }).join("") : '<div class="empty">Nenhum pedido encontrado para os filtros selecionados.</div>';
  }

  function renderSummary() {
    const dateISO = App.Utils.dateToISO($("#summary-date").value);
    const summary = App.Resumo.build(dateISO || "", App.Agendamentos.getAll(), $("#summary-type").value);
    const buffets = summary.deliveries.filter(item => item.type === "buffet")
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    const presencial = summary.deliveries.filter(item => item.type === "presencial")
      .sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
    const delivery = item => `<li>${App.Utils.escape(item.name)}${App.Utils.address(item) ? ` · ${App.Utils.escape(App.Utils.address(item))}` : ""} (${item.pizzas.reduce((sum, pizza) => sum + (Number(pizza.quantity) || 0), 0)} pizzas) — ${App.Utils.money(item.total)}</li>`;
    $("#summary-content").innerHTML = `<div><h3>Produção — ${dateISO ? App.Utils.displayDate(dateISO) : "data inválida"}</h3>
      <p><strong>Total de pizzas:</strong> ${summary.pizzaCount}</p><p><strong>Faturamento buffets:</strong> ${App.Utils.money(summary.buffetRevenue)}</p>
      <p><strong>Faturamento pedidos do dia:</strong> ${App.Utils.money(summary.presentialRevenue)}</p><p><strong>Total geral:</strong> ${App.Utils.money(summary.revenue)}</p><p><strong>Sinais recebidos:</strong> ${App.Utils.money(summary.received)}</p>
      ${summary.flavors.length ? `<ul>${summary.flavors.map(item => `<li>${App.Utils.escape(item.flavor)} (${App.Utils.escape(item.size)}): <strong>${item.quantity}</strong></li>`).join("")}</ul>` : '<p class="muted">Nenhuma pizza para esta data.</p>'}
      </div><div><h3>Entregas — buffets por horário</h3>${buffets.length ? `<ol>${buffets.map(item => `<li><strong>${App.Utils.escape(item.time)}</strong> — ${delivery(item).replace(/^<li>|<\/li>$/g, "")}</li>`).join("")}</ol>` : '<p class="muted">Nenhum buffet para esta data.</p>'}
      <h3>Pedidos do dia — ordem de chegada</h3>${presencial.length ? `<ol>${presencial.map(item => `<li><strong>${App.Utils.escape(item.orderedAt.slice(11, 16))}</strong> — ${delivery(item).replace(/^<li>|<\/li>$/g, "")}</li>`).join("")}</ol>` : '<p class="muted">Nenhum pedido do dia para esta data.</p>'}</div>`;
  }

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
    renderPizzaMenu();
    App.Utils.toast("Sabor salvo.");
  }

  function deleteAppointment(id) {
    const item = App.Agendamentos.find(id);
    if (!item || !confirm(`Excluir o pedido de ${item.name}? Esta ação não pode ser desfeita.`)) return;
    if (!App.Agendamentos.remove(id)) return;
    renderAll();
    App.Utils.toast("Pedido excluído.");
  }

  function editAppointment(id) {
    const item = App.Agendamentos.find(id);
    if (!item) return;
    setAppointmentForm(item);
    $("#appointment-dialog").showModal();
  }

  function renderAll() {
    renderKitchen();
    renderAppointments();
    renderSummary();
  }

  function switchTab(tab) {
    const menuSelected = tab === "menu";
    $("#kitchen-view").classList.toggle("hidden", menuSelected || tab !== "kitchen");
    $("#all-orders-view").classList.toggle("hidden", menuSelected || tab !== "orders");
    $("#menu-view").classList.toggle("hidden", !menuSelected);
    $$(".tab").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
    if (tab === "orders") renderAppointments();
    if (tab === "kitchen") renderKitchen();
  }

  function bindDateMask(input) {
    input.addEventListener("input", () => { input.value = App.Utils.maskDate(input.value); });
  }

  function syncProductionDisclosure() {
    $("#production-details").open = !window.matchMedia("(max-width: 760px)").matches;
  }

  function bindEvents() {
    syncProductionDisclosure();
    window.addEventListener("resize", syncProductionDisclosure);
    $("#new-appointment").addEventListener("click", () => {
      setAppointmentForm(null, "presencial");
      $("#appointment-dialog").showModal();
    });
    $$("[data-close]").forEach(button => button.addEventListener("click", () => {
      $(`#${button.dataset.close}`).close();
    }));
    $("#appointment-form").addEventListener("submit", saveAppointment);
    $$("[data-order-type]").forEach(button => button.addEventListener("click", () => {
      if (editingId) return;
      statusByType[activeType] = $("#status").value;
      setOrderType(button.dataset.orderType);
      updateOrderTotals();
    }));
    $("#status").addEventListener("change", () => { statusByType[activeType] = $("#status").value; });
    $("#flavor-form").addEventListener("submit", saveFlavor);
    $("#pizza-search").addEventListener("input", renderPizzaMenu);
    $("#add-custom-pizza").addEventListener("click", () => addCustomPizza());
    $("#custom-pizza-list").addEventListener("input", event => {
      const field = event.target.dataset.customField;
      if (!field) return;
      const pizza = customSelections.find(item => item.key === event.target.closest("[data-custom-key]").dataset.customKey);
      if (!pizza) return;
      pizza[field] = field === "quantity" || field === "unitPrice" ? Math.max(0, Number(event.target.value) || 0) : event.target.value;
      updateOrderTotals();
    });
    $("#custom-pizza-list").addEventListener("change", event => {
      const field = event.target.dataset.customField;
      if (!field) return;
      const pizza = customSelections.find(item => item.key === event.target.closest("[data-custom-key]").dataset.customKey);
      if (pizza) {
        pizza[field] = field === "quantity"
          ? Math.max(0, Math.floor(Number(event.target.value) || 0))
          : field === "unitPrice" ? Math.max(0, Number(event.target.value) || 0) : event.target.value;
        if (field === "quantity" || field === "unitPrice") event.target.value = String(pizza[field]);
      }
      updateOrderTotals();
    });
    $("#custom-pizza-list").addEventListener("click", event => {
      const button = event.target.closest("[data-remove-custom]");
      if (!button) return;
      customSelections = customSelections.filter(item => item.key !== button.dataset.removeCustom);
      renderCustomPizzas();
      updateOrderTotals();
    });
    $("#pizza-menu-list").addEventListener("click", event => {
      const button = event.target.closest("[data-quantity-step]");
      if (!button) return;
      const menuItem = App.Cardapio.find(button.dataset.menuId);
      const keySize = button.dataset.size;
      let pizza = selectedPizza(menuItem.id, keySize);
      if (!pizza) {
        pizza = { flavor: menuItem.name, category: menuItem.category, menuId: menuItem.id, size: keySize, quantity: 0, unitPrice: Number(menuItem.prices[keySize]) || 0 };
        pizzaSelections.push(pizza);
      }
      pizza.quantity = Math.max(0, pizza.quantity + Number(button.dataset.quantityStep));
      const input = $(`[data-menu-quantity][data-menu-id="${CSS.escape(menuItem.id)}"][data-size="${keySize}"]`, $("#pizza-menu-list"));
      if (input) input.value = pizza.quantity;
      renderPizzaMenu();
      updateOrderTotals();
    });
    $("#pizza-menu-list").addEventListener("input", event => {
      if (!event.target.matches("[data-menu-quantity]")) return;
      const menuItem = App.Cardapio.find(event.target.dataset.menuId);
      if (!menuItem) return;
      const size = event.target.dataset.size;
      let pizza = selectedPizza(menuItem.id, size);
      if (!pizza) {
        pizza = { flavor: menuItem.name, category: menuItem.category, menuId: menuItem.id, size, quantity: 0, unitPrice: Number(menuItem.prices[size]) || 0 };
        pizzaSelections.push(pizza);
      }
      pizza.quantity = Math.max(0, Math.floor(Number(event.target.value) || 0));
      event.target.closest("tr").classList.toggle("selected-flavor", pizza.quantity > 0);
      updateOrderTotals();
    });
    $("#pizza-menu-list").addEventListener("change", event => {
      if (!event.target.matches("[data-menu-quantity]")) return;
      const pizza = selectedPizza(event.target.dataset.menuId, event.target.dataset.size);
      if (pizza) event.target.value = String(pizza.quantity);
    });
    $("#customer-phone").addEventListener("input", event => { event.target.value = App.Utils.maskPhone(event.target.value); });
    [$("#delivery-date"), $("#date-from"), $("#date-to"), $("#summary-date")].forEach(bindDateMask);
    $("#delivery-time").addEventListener("input", event => { event.target.value = App.Utils.maskTime(event.target.value); });
    ["delivery-fee", "discount", "discount-type", "deposit"].forEach(id => {
      $(`#${id}`).addEventListener("input", updateOrderTotals);
    });
    ["search", "status-filter", "type-filter", "date-filter", "date-from", "date-to", "sort-orders"].forEach(id => {
      $(`#${id}`).addEventListener("input", renderAppointments);
    });
    $("#date-filter").addEventListener("change", () => {
      $("#custom-range").classList.toggle("hidden", $("#date-filter").value !== "custom");
      renderAppointments();
    });
    $("#summary-date").addEventListener("input", () => {
      if ($("#summary-date").value.length === 10) renderSummary();
    });
    $("#summary-type").addEventListener("change", renderSummary);
    $("#undo-delivery").addEventListener("click", undoDelivery);
    ["today-orders", "today-buffets"].forEach(id => {
      $(`#${id}`).addEventListener("click", event => {
        const button = event.target.closest("[data-advance]");
        if (!button) return;
        const item = App.Agendamentos.find(button.dataset.advance);
        if (item) advanceStatus(item);
      });
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
    $("#appointment-list").addEventListener("click", event => {
      const advance = event.target.closest("[data-advance]");
      if (!advance) return;
      const item = App.Agendamentos.find(advance.dataset.advance);
      if (item) advanceStatus(item);
    });
    $("#menu-list").addEventListener("click", event => {
      const edit = event.target.closest("[data-menu-edit]");
      const toggle = event.target.closest("[data-menu-toggle]");
      const remove = event.target.closest("[data-menu-delete]");
      if (edit) openFlavorForm(App.Cardapio.find(edit.dataset.menuEdit));
      if (toggle && App.Cardapio.toggle(toggle.dataset.menuToggle)) {
        renderMenu();
        renderPizzaMenu();
        App.Utils.toast("Disponibilidade atualizada.");
      }
      if (remove) {
        const item = App.Cardapio.find(remove.dataset.menuDelete);
        if (item && confirm(`Excluir o sabor ${item.name} do cardápio? Pedidos existentes não serão alterados.`) &&
          App.Cardapio.remove(item.id)) {
          renderMenu();
          renderPizzaMenu();
          App.Utils.toast("Sabor excluído do cardápio.");
        }
      }
    });
    $("#new-flavor").addEventListener("click", () => openFlavorForm());
    $("#restore-menu").addEventListener("click", () => {
      if (!confirm("Restaurar o cardápio inicial? Os sabores atuais serão substituídos.")) return;
      if (App.Cardapio.restore()) {
        renderMenu();
        renderPizzaMenu();
        App.Utils.toast("Cardápio inicial restaurado.");
      }
    });
    $$(".tab").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  }

  App.UI = {
    init: bindEvents,
    renderAll,
    renderMenu,
    renderPizzaMenu
  };
})(window);
