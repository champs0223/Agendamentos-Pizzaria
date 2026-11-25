import test from "node:test";
import assert from "node:assert/strict";
import { InputError, normalizeAppointment, normalizeFeedback, normalizeMenu } from "../lib/validation.js";

const appointmentPayload = {
  externalId: "chatbot-order-42",
  type: "massas",
  name: "Pizzaria Exemplo",
  phone: "11987654321",
  date: "2026-11-27",
  time: "14:30",
  street: "Rua Principal",
  number: "12",
  neighborhood: "Centro",
  discountType: "percent",
  discountValue: 10,
  deliveryFee: 4,
  pizzas: [
    { flavor: "Mussarela", category: "Tradicional", size: "Grande", quantity: 2, unitPrice: 25 },
    { flavor: "Calabresa", category: "Tradicional", size: "Média", quantity: 1, unitPrice: 50 }
  ]
};

test("normalizes a masses appointment and calculates totals on the server", () => {
  const appointment = normalizeAppointment(appointmentPayload);
  assert.equal(appointment.type, "massas");
  assert.equal(appointment.subtotal, 100);
  assert.equal(appointment.discountAmount, 10);
  assert.equal(appointment.total, 94);
  assert.equal(appointment.people, null);
});

test("rejects appointments missing an idempotency key or valid schedule", () => {
  assert.throws(() => normalizeAppointment({ ...appointmentPayload, externalId: "" }), InputError);
  assert.throws(() => normalizeAppointment({ ...appointmentPayload, date: "2026-02-30" }), InputError);
  assert.throws(() => normalizeAppointment({ ...appointmentPayload, time: "24:00" }), InputError);
});

test("validates feedback ratings and menu price structures", () => {
  assert.equal(normalizeFeedback({ externalId: "feedback-1", rating: 5 }).rating, 5);
  assert.throws(() => normalizeFeedback({ externalId: "feedback-2", rating: 6 }), InputError);
  assert.deepEqual(normalizeMenu({
    id: "flavor-1",
    name: "Mussarela",
    prices: { Broto: 20, "Média": 35, Grande: 50 }
  }).prices, { Broto: 20, "Média": 35, Grande: 50 });
});
