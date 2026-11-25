export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

const STATUSES = ["Agendado", "Recebido", "Em preparo", "Saiu para entrega", "Entregue", "Cancelado"];
const PAYMENT_FORMS = ["Dinheiro", "Pix", "Cartão", "Pendente"];
const SIZES = ["Broto", "Média", "Grande"];

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError(`${label} deve ser um objeto.`);
  }
  return value;
}

function text(value, label, maxLength, required = false) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new InputError(`${label} é obrigatório.`);
  if (result.length > maxLength) throw new InputError(`${label} excede ${maxLength} caracteres.`);
  return result;
}

function amount(value, label, fallback = 0) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999999999) {
    throw new InputError(`${label} deve ser um valor numérico não negativo.`);
  }
  return Math.round(parsed * 100) / 100;
}

function requiredExternalId(input) {
  return text(input.externalId, "externalId", 120, true);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeAppointment(value) {
  const input = object(value, "Agendamento");
  const type = input.type === "massas" || input.type === "buffet" ? input.type : "";
  if (!type) throw new InputError("type deve ser massas ou buffet.");

  const date = text(input.date, "date", 10, true);
  if (!validDate(date)) throw new InputError("date deve usar uma data ISO válida (AAAA-MM-DD).");
  const time = text(input.time, "time", 5, true);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new InputError("time deve usar o formato HH:MM.");

  if (!Array.isArray(input.pizzas) || input.pizzas.length === 0 || input.pizzas.length > 300) {
    throw new InputError("pizzas deve conter de 1 a 300 itens.");
  }
  const pizzas = input.pizzas.map((value, index) => {
    const pizza = object(value, `pizzas[${index}]`);
    const size = text(pizza.size, `pizzas[${index}].size`, 20, true);
    if (!SIZES.includes(size)) throw new InputError(`pizzas[${index}].size é inválido.`);
    const quantity = Number(pizza.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      throw new InputError(`pizzas[${index}].quantity deve ser um inteiro positivo.`);
    }
    return {
      flavor: text(pizza.flavor, `pizzas[${index}].flavor`, 100, true),
      category: text(pizza.category || "Personalizado", `pizzas[${index}].category`, 60, true),
      size,
      quantity,
      unitPrice: amount(pizza.unitPrice, `pizzas[${index}].unitPrice`),
      menuId: text(pizza.menuId, `pizzas[${index}].menuId`, 120)
    };
  });

  const subtotal = Math.round(pizzas.reduce((sum, pizza) => sum + pizza.quantity * pizza.unitPrice, 0) * 100) / 100;
  const deliveryFee = amount(input.deliveryFee, "deliveryFee");
  const discountType = input.discountType === "percent" ? "percent" : "amount";
  const discountValue = amount(input.discountValue, "discountValue");
  if (discountType === "percent" && discountValue > 100) {
    throw new InputError("discountValue não pode ultrapassar 100%.");
  }
  const rawDiscount = discountType === "percent"
    ? Math.round(subtotal * discountValue) / 100
    : discountValue;
  const discountAmount = Math.min(subtotal, rawDiscount);
  const total = Math.max(0, Math.round((subtotal + deliveryFee - discountAmount) * 100) / 100);
  const people = type === "buffet" && input.people !== "" && input.people != null
    ? Number(input.people)
    : null;
  if (people !== null && (!Number.isInteger(people) || people < 1 || people > 100000)) {
    throw new InputError("people deve ser um inteiro positivo para buffets.");
  }
  const status = text(input.status || "Agendado", "status", 30);
  if (!STATUSES.includes(status)) throw new InputError("status é inválido.");
  const paymentForm = text(input.paymentForm || "Pendente", "paymentForm", 30);
  if (!PAYMENT_FORMS.includes(paymentForm)) throw new InputError("paymentForm é inválido.");
  const etaMinutes = input.etaMinutes == null || input.etaMinutes === "" ? null : Number(input.etaMinutes);
  if (etaMinutes !== null && (!Number.isInteger(etaMinutes) || etaMinutes < 1 || etaMinutes > 10080)) {
    throw new InputError("etaMinutes deve ser um inteiro entre 1 e 10080.");
  }

  return {
    externalId: requiredExternalId(input),
    type,
    name: text(input.name, "name", 120, true),
    phone: text(input.phone, "phone", 30, true),
    date,
    time,
    street: text(input.street, "street", 150, true),
    number: text(input.number, "number", 20, true),
    neighborhood: text(input.neighborhood, "neighborhood", 100, true),
    complement: text(input.complement, "complement", 100),
    reference: text(input.reference, "reference", 150),
    people,
    status,
    paymentForm,
    deliveryFee,
    discountType,
    discountValue,
    discountAmount,
    subtotal,
    total,
    deposit: type === "buffet" ? amount(input.deposit, "deposit") : 0,
    etaMinutes: type === "massas" ? etaMinutes : null,
    notes: text(input.notes, "notes", 1000),
    pizzas
  };
}

export function normalizeFeedback(value) {
  const input = object(value, "Avaliação");
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new InputError("rating deve ser um inteiro de 1 a 5.");
  }
  const appointmentId = text(input.appointmentId, "appointmentId", 36);
  if (appointmentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(appointmentId)) {
    throw new InputError("appointmentId deve ser um UUID válido.");
  }
  const createdAt = input.createdAt == null ? new Date().toISOString() : text(input.createdAt, "createdAt", 40, true);
  if (!Number.isFinite(new Date(createdAt).getTime())) throw new InputError("createdAt deve ser uma data ISO válida.");
  return {
    externalId: requiredExternalId(input),
    appointmentId: appointmentId || null,
    customerName: text(input.customerName, "customerName", 120),
    rating,
    comment: text(input.comment, "comment", 2000),
    createdAt: new Date(createdAt).toISOString()
  };
}

export function normalizeMenu(value) {
  const input = object(value, "Sabor");
  const prices = object(input.prices, "prices");
  const normalizedPrices = Object.fromEntries(SIZES.map(size => [size, amount(prices[size], `prices.${size}`)]));
  return {
    id: text(input.id, "id", 120, true),
    name: text(input.name, "name", 100, true),
    category: text(input.category || "Tradicional", "category", 60, true),
    prices: normalizedPrices,
    available: input.available !== false
  };
}

export { STATUSES };
