import { createServer } from "node:http";
import { timingSafeEqual, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  InputError,
  normalizeAppointment,
  normalizeFeedback,
  normalizeMenu,
  STATUSES
} from "./lib/validation.js";

const { Pool } = pg;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REQUIRED_ENV = ["DATABASE_URL", "ORDERS_BOT_TOKEN", "SATISFACTION_BOT_TOKEN", "ADMIN_API_TOKEN"];
const SESSION_COOKIE = "mascavo_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const missing = REQUIRED_ENV.filter(name => !process.env[name]);
if (missing.length) {
  throw new Error(`Configure as variáveis obrigatórias no arquivo .env: ${missing.join(", ")}.`);
}
const weakTokens = REQUIRED_ENV.filter(name => name.endsWith("_TOKEN") && process.env[name].length < 32);
if (weakTokens.length) {
  throw new Error(`Use tokens aleatórios com pelo menos 32 caracteres: ${weakTokens.join(", ")}.`);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined,
  max: Number(process.env.PGPOOL_MAX) || 10
});

pool.on("error", error => console.error("Erro inesperado no pool PostgreSQL.", error));

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(data));
}

function authorized(request, expectedToken) {
  const [scheme, supplied] = String(request.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !supplied) return false;
  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function cookieValue(request, name) {
  const cookies = String(request.headers.cookie || "").split(";");
  const entry = cookies.map(cookie => cookie.trim()).find(cookie => cookie.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : "";
}

function isAdminSession(request) {
  const sessionId = cookieValue(request, SESSION_COOKIE);
  const expiresAt = sessions.get(sessionId);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function requireToken(request, response, token, label) {
  if (authorized(request, token)) return true;
  sendJson(response, 401, { error: { code: "unauthorized", message: `Autenticação inválida para ${label}.` } });
  return false;
}

async function requireAdmin(request, response) {
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: { code: "origin_denied", message: "Origem da requisição não autorizada." } });
    return false;
  }
  if (isAdminSession(request) || authorized(request, process.env.ADMIN_API_TOKEN)) return true;
  sendJson(response, 401, { error: { code: "unauthorized", message: "Autenticação administrativa necessária." } });
  return false;
}

async function readJson(request) {
  const contentType = String(request.headers["content-type"] || "").split(";")[0].trim();
  if (contentType !== "application/json") {
    throw new HttpError(415, "unsupported_media_type", "Envie o corpo como application/json.");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_048_576) throw new HttpError(413, "body_too_large", "O corpo da requisição excede 1 MB.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "O corpo da requisição não contém JSON válido.");
  }
}

function appointmentSelect() {
  return `
    SELECT a.id, a.external_id AS "externalId", a.source, a.type, a.name, a.phone,
      to_char(a.appointment_date, 'YYYY-MM-DD') AS date,
      to_char(a.appointment_time, 'HH24:MI') AS time,
      a.street, a.street_number AS number, a.neighborhood, a.complement,
      a.reference_point AS reference, a.people, a.status, a.payment_form AS "paymentForm",
      a.delivery_fee AS "deliveryFee", a.discount_type AS "discountType",
      a.discount_value AS "discountValue", a.discount_amount AS "discountAmount",
      a.subtotal, a.total, a.deposit, a.eta_minutes AS "etaMinutes", a.notes,
      a.order_number AS "orderNumber", a.created_at AS "createdAt",
      COALESCE(json_agg(json_build_object(
        'flavor', ai.flavor, 'category', ai.category, 'size', ai.size,
        'quantity', ai.quantity, 'unitPrice', ai.unit_price, 'menuId', ai.menu_id
      )) FILTER (WHERE ai.id IS NOT NULL), '[]'::json) AS pizzas
    FROM appointments a
    LEFT JOIN appointment_items ai ON ai.appointment_id = a.id`;
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  if (pathname === "/api/v1/admin/session") {
    if (request.method === "GET") {
      if (!isAdminSession(request)) {
        return sendJson(response, 401, { error: { code: "unauthorized", message: "Sessão administrativa necessária." } });
      }
      return sendJson(response, 200, { authenticated: true });
    }
    if (request.method === "POST") {
      if (!sameOrigin(request)) {
        throw new HttpError(403, "origin_denied", "Origem da requisição não autorizada.");
      }
      const body = await readJson(request);
      if (!authorized({ headers: { authorization: `Bearer ${body?.token || ""}` } }, process.env.ADMIN_API_TOKEN)) {
        return sendJson(response, 401, { error: { code: "unauthorized", message: "Token administrativo inválido." } });
      }
      const sessionId = randomBytes(32).toString("base64url");
      sessions.set(sessionId, Date.now() + SESSION_TTL_MS);
      const secure = request.socket.encrypted ? "; Secure" : "";
      response.setHeader("set-cookie", `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
      return sendJson(response, 200, { authenticated: true });
    }
    if (request.method === "DELETE") {
      const sessionId = cookieValue(request, SESSION_COOKIE);
      sessions.delete(sessionId);
      response.setHeader("set-cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      return sendJson(response, 200, { authenticated: false });
    }
    throw new HttpError(405, "method_not_allowed", "Método não permitido.");
  }

  if (request.method === "GET" && pathname === "/api/v1/health") {
    await pool.query("SELECT 1");
    return sendJson(response, 200, { status: "ok", database: "connected" });
  }

  if (request.method === "GET" && pathname === "/api/v1/cardapio") {
    const result = await pool.query(
      "SELECT id, name, category, prices, available FROM menu_items WHERE available = true ORDER BY category, name"
    );
    return sendJson(response, 200, { items: result.rows });
  }

  if (request.method === "POST" && pathname === "/api/v1/agendamentos") {
    if (!await requireToken(request, response, process.env.ORDERS_BOT_TOKEN, "chatbot de pedidos")) return;
    const appointment = normalizeAppointment(await readJson(request));
    const client = await pool.connect();
    let responseData;
    let status = 201;
    try {
      await client.query("BEGIN");
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO appointments (
          id, external_id, source, type, name, phone, appointment_date, appointment_time,
          street, street_number, neighborhood, complement, reference_point, people,
          status, payment_form, delivery_fee, discount_type, discount_value,
          discount_amount, subtotal, total, deposit, eta_minutes, notes
        ) VALUES (
          $1, $2, 'orders-chatbot', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        ) ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
        [
          id, appointment.externalId, appointment.type, appointment.name, appointment.phone,
          appointment.date, appointment.time, appointment.street, appointment.number,
          appointment.neighborhood, appointment.complement, appointment.reference,
          appointment.people, appointment.status, appointment.paymentForm,
          appointment.deliveryFee, appointment.discountType, appointment.discountValue,
          appointment.discountAmount, appointment.subtotal, appointment.total,
          appointment.deposit, appointment.etaMinutes, appointment.notes
        ]
      );
      if (!inserted.rowCount) {
        const existing = await client.query(
          "SELECT id, order_number AS \"orderNumber\" FROM appointments WHERE source = 'orders-chatbot' AND external_id = $1",
          [appointment.externalId]
        );
        await client.query("COMMIT");
        responseData = { id: existing.rows[0].id, orderNumber: existing.rows[0].orderNumber, duplicate: true };
        status = 200;
      } else {
        let orderNumber = null;
        if (appointment.type === "massas") {
          const counter = await client.query(
            `INSERT INTO daily_order_counters (order_date, last_number)
             VALUES (CURRENT_DATE, 1)
             ON CONFLICT (order_date) DO UPDATE
               SET last_number = daily_order_counters.last_number + 1
             RETURNING last_number`
          );
          orderNumber = counter.rows[0].last_number;
          await client.query(
            "UPDATE appointments SET order_number = $2 WHERE id = $1",
            [id, orderNumber]
          );
        }
        for (const pizza of appointment.pizzas) {
          await client.query(
            `INSERT INTO appointment_items
              (appointment_id, flavor, category, size, quantity, unit_price, menu_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, pizza.flavor, pizza.category, pizza.size, pizza.quantity, pizza.unitPrice, pizza.menuId || null]
          );
        }
        await client.query("COMMIT");
        responseData = { id, orderNumber, duplicate: false };
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return sendJson(response, status, responseData);
  }

  if (request.method === "POST" && pathname === "/api/v1/avaliacoes") {
    if (!await requireToken(request, response, process.env.SATISFACTION_BOT_TOKEN, "chatbot de satisfação")) return;
    const feedback = normalizeFeedback(await readJson(request));
    const result = await pool.query(
      `INSERT INTO feedback (id, external_id, source, appointment_id, customer_name, rating, comment, created_at)
       VALUES ($1, $2, 'satisfaction-chatbot', $3, $4, $5, $6, $7)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id`,
      [randomUUID(), feedback.externalId, feedback.appointmentId, feedback.customerName,
        feedback.rating, feedback.comment, feedback.createdAt]
    );
    if (result.rowCount) return sendJson(response, 201, { id: result.rows[0].id, duplicate: false });
    const existing = await pool.query(
      "SELECT id FROM feedback WHERE source = 'satisfaction-chatbot' AND external_id = $1",
      [feedback.externalId]
    );
    return sendJson(response, 200, { id: existing.rows[0].id, duplicate: true });
  }

  if (pathname.startsWith("/api/v1/admin/")) {
    if (!await requireAdmin(request, response)) return;
  }

  if (request.method === "GET" && pathname === "/api/v1/admin/agendamentos") {
    const type = url.searchParams.get("type");
    if (type && !["massas", "buffet"].includes(type)) {
      throw new HttpError(400, "invalid_type", "type deve ser massas ou buffet.");
    }
    const result = await pool.query(
      `${appointmentSelect()}
       ${type ? "WHERE a.type = $1" : ""}
       GROUP BY a.id
       ORDER BY a.appointment_date, a.appointment_time`,
      type ? [type] : []
    );
    return sendJson(response, 200, { items: result.rows });
  }

  if (request.method === "PATCH" && /^\/api\/v1\/admin\/agendamentos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/status$/i.test(pathname)) {
    const id = pathname.split("/")[5];
    const body = await readJson(request);
    if (!STATUSES.includes(body?.status)) throw new InputError("status é inválido.");
    const result = await pool.query(
      "UPDATE appointments SET status = $2, updated_at = now() WHERE id = $1 RETURNING id, status",
      [id, body.status]
    );
    if (!result.rowCount) throw new HttpError(404, "not_found", "Agendamento não encontrado.");
    return sendJson(response, 200, result.rows[0]);
  }

  if (request.method === "PUT" && /^\/api\/v1\/admin\/agendamentos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname)) {
    const id = pathname.split("/")[5];
    const appointment = normalizeAppointment(await readJson(request));
    const client = await pool.connect();
    let orderNumber = null;
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        "SELECT type, order_number FROM appointments WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (!existing.rowCount) throw new HttpError(404, "not_found", "Agendamento não encontrado.");
      if (appointment.type === "massas") {
        orderNumber = existing.rows[0].type === "massas" ? existing.rows[0].order_number : null;
        if (orderNumber == null) {
          const counter = await client.query(
            `INSERT INTO daily_order_counters (order_date, last_number)
             VALUES (CURRENT_DATE, 1)
             ON CONFLICT (order_date) DO UPDATE
               SET last_number = daily_order_counters.last_number + 1
             RETURNING last_number`
          );
          orderNumber = counter.rows[0].last_number;
        }
      }
      await client.query(
        `UPDATE appointments SET type = $2, name = $3, phone = $4, appointment_date = $5,
          appointment_time = $6, street = $7, street_number = $8, neighborhood = $9,
          complement = $10, reference_point = $11, people = $12, status = $13,
          payment_form = $14, delivery_fee = $15, discount_type = $16, discount_value = $17,
          discount_amount = $18, subtotal = $19, total = $20, deposit = $21,
          eta_minutes = $22, notes = $23, order_number = $24, updated_at = now()
         WHERE id = $1`,
        [
          id, appointment.type, appointment.name, appointment.phone, appointment.date,
          appointment.time, appointment.street, appointment.number, appointment.neighborhood,
          appointment.complement, appointment.reference, appointment.people, appointment.status,
          appointment.paymentForm, appointment.deliveryFee, appointment.discountType,
          appointment.discountValue, appointment.discountAmount, appointment.subtotal,
          appointment.total, appointment.deposit, appointment.etaMinutes, appointment.notes,
          orderNumber
        ]
      );
      await client.query("DELETE FROM appointment_items WHERE appointment_id = $1", [id]);
      for (const pizza of appointment.pizzas) {
        await client.query(
          `INSERT INTO appointment_items
            (appointment_id, flavor, category, size, quantity, unit_price, menu_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, pizza.flavor, pizza.category, pizza.size, pizza.quantity, pizza.unitPrice, pizza.menuId || null]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return sendJson(response, 200, { id, orderNumber });
  }

  if (request.method === "DELETE" && /^\/api\/v1\/admin\/agendamentos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname)) {
    const id = pathname.split("/")[5];
    const result = await pool.query("DELETE FROM appointments WHERE id = $1 RETURNING id", [id]);
    if (!result.rowCount) throw new HttpError(404, "not_found", "Agendamento não encontrado.");
    return sendJson(response, 200, { id });
  }

  if (request.method === "POST" && pathname === "/api/v1/admin/migrar-dados-locais") {
    const body = await readJson(request);
    if (!Array.isArray(body?.appointments) || !Array.isArray(body?.feedback) ||
        body.appointments.length > 5000 || body.feedback.length > 5000) {
      throw new InputError("appointments e feedback devem ser listas com até 5000 registros cada.");
    }
    const appointments = body.appointments.map((item, index) => normalizeAppointment({
      ...item,
      externalId: item.externalId || `local-order-${String(item.id || index + 1).slice(0, 100)}`,
      type: item.type === "massas" || item.type === "presencial" ? "massas" : "buffet"
    }));
    const feedback = body.feedback.map((item, index) => normalizeFeedback({
      ...item,
      externalId: item.externalId || `local-feedback-${String(item.id || index + 1).slice(0, 100)}`,
      appointmentId: ""
    }));
    const client = await pool.connect();
    const importedIds = new Map();
    let importedAppointments = 0;
    let importedFeedback = 0;
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE appointments, feedback IN SHARE ROW EXCLUSIVE MODE");
      for (let index = 0; index < appointments.length; index += 1) {
        const appointment = appointments[index];
        const legacyId = String(body.appointments[index].id || "");
        const existing = await client.query(
          "SELECT id FROM appointments WHERE source = 'local-migration' AND external_id = $1",
          [appointment.externalId]
        );
        if (existing.rowCount) {
          importedIds.set(legacyId, existing.rows[0].id);
          continue;
        }
        const id = randomUUID();
        const counter = appointment.type === "massas"
          ? await client.query(
            `INSERT INTO daily_order_counters (order_date, last_number)
             VALUES (CURRENT_DATE, 1)
             ON CONFLICT (order_date) DO UPDATE
               SET last_number = daily_order_counters.last_number + 1
             RETURNING last_number`
          )
          : null;
        const orderNumber = counter ? counter.rows[0].last_number : null;
        const legacyDate = body.appointments[index].orderedAt || body.appointments[index].createdAt;
        const createdAt = Number.isFinite(new Date(legacyDate).getTime()) ? new Date(legacyDate).toISOString() : new Date().toISOString();
        await client.query(
          `INSERT INTO appointments (
            id, external_id, source, type, name, phone, appointment_date, appointment_time,
            street, street_number, neighborhood, complement, reference_point, people,
            status, payment_form, delivery_fee, discount_type, discount_value,
            discount_amount, subtotal, total, deposit, eta_minutes, notes, order_number, created_at
          ) VALUES (
            $1, $2, 'local-migration', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
          )`,
          [
            id, appointment.externalId, appointment.type, appointment.name, appointment.phone,
            appointment.date, appointment.time, appointment.street, appointment.number,
            appointment.neighborhood, appointment.complement, appointment.reference,
            appointment.people, appointment.status, appointment.paymentForm,
            appointment.deliveryFee, appointment.discountType, appointment.discountValue,
            appointment.discountAmount, appointment.subtotal, appointment.total,
            appointment.deposit, appointment.etaMinutes, appointment.notes, orderNumber, createdAt
          ]
        );
        importedAppointments += 1;
        importedIds.set(legacyId, id);
        for (const pizza of appointment.pizzas) {
          await client.query(
            `INSERT INTO appointment_items
              (appointment_id, flavor, category, size, quantity, unit_price, menu_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, pizza.flavor, pizza.category, pizza.size, pizza.quantity, pizza.unitPrice, pizza.menuId || null]
          );
        }
      }
      for (let index = 0; index < feedback.length; index += 1) {
        const item = feedback[index];
        const existing = await client.query(
          "SELECT 1 FROM feedback WHERE source = 'local-migration' AND external_id = $1",
          [item.externalId]
        );
        if (existing.rowCount) continue;
        const legacyAppointmentId = String(body.feedback[index].appointmentId || "");
        await client.query(
          `INSERT INTO feedback (id, external_id, source, appointment_id, customer_name, rating, comment, created_at)
           VALUES ($1, $2, 'local-migration', $3, $4, $5, $6, $7)`,
          [
            randomUUID(), item.externalId, importedIds.get(legacyAppointmentId) || null,
            item.customerName, item.rating, item.comment, item.createdAt
          ]
        );
        importedFeedback += 1;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return sendJson(response, 200, { appointments: importedAppointments, feedback: importedFeedback });
  }

  if (request.method === "GET" && pathname === "/api/v1/admin/satisfacao") {
    const [summary, distribution, monthly, recent] = await Promise.all([
      pool.query(
        `SELECT count(*)::integer AS count,
          round(avg(rating)::numeric, 1) AS average,
          count(*) FILTER (WHERE rating >= 4)::integer AS positive
         FROM feedback`
      ),
      pool.query("SELECT rating, count(*)::integer AS count FROM feedback GROUP BY rating ORDER BY rating DESC"),
      pool.query(
        `WITH months AS (
          SELECT date_trunc('month', now()) - (interval '1 month' * month_index) AS month_start
          FROM generate_series(5, 0, -1) AS series(month_index)
         )
         SELECT to_char(months.month_start, 'YYYY-MM') AS month,
          count(feedback.id)::integer AS count, round(avg(feedback.rating)::numeric, 1) AS average
         FROM months
         LEFT JOIN feedback ON feedback.created_at >= months.month_start
           AND feedback.created_at < months.month_start + interval '1 month'
         GROUP BY months.month_start
         ORDER BY months.month_start`
      ),
      pool.query(
        `SELECT id, appointment_id AS "appointmentId", customer_name AS "customerName",
          rating, comment, source, created_at AS "createdAt"
         FROM feedback ORDER BY created_at DESC LIMIT 8`
      )
    ]);
    const counts = summary.rows[0];
    return sendJson(response, 200, {
      count: counts.count,
      average: counts.average == null ? null : Number(counts.average),
      positivePercent: counts.count ? Math.round(counts.positive / counts.count * 100) : null,
      distribution: distribution.rows,
      monthly: monthly.rows,
      recent: recent.rows
    });
  }

  if (request.method === "GET" && pathname === "/api/v1/admin/cardapio") {
    const result = await pool.query(
      "SELECT id, name, category, prices, available FROM menu_items ORDER BY category, name"
    );
    return sendJson(response, 200, { items: result.rows });
  }

  if (request.method === "PUT" && pathname === "/api/v1/admin/cardapio") {
    const body = await readJson(request);
    if (!Array.isArray(body?.items) || body.items.length > 500) {
      throw new InputError("items deve ser uma lista com até 500 sabores.");
    }
    const items = body.items.map(normalizeMenu);
    if (new Set(items.map(item => item.id)).size !== items.length) {
      throw new InputError("Cada sabor precisa ter um id único.");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM menu_items");
      for (const item of items) {
        await client.query(
          `INSERT INTO menu_items (id, name, category, prices, available)
           VALUES ($1, $2, $3, $4, $5)`,
          [item.id, item.name, item.category, JSON.stringify(item.prices), item.available]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return sendJson(response, 200, { saved: items.length });
  }

  return false;
}

async function serveStatic(request, response, pathname) {
  let requested;
  try {
    requested = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, "invalid_path", "Caminho inválido.");
  }
  const relative = requested === "/" ? "index.html" : requested.slice(1);
  const isAllowed = relative === "index.html" ||
    /^(css|js)\/[a-zA-Z0-9._-]+\.(css|js)$/.test(relative);
  if (!isAllowed) throw new HttpError(404, "not_found", "Arquivo não encontrado.");
  const absolute = path.resolve(ROOT, relative);
  if (!absolute.startsWith(`${ROOT}${path.sep}`)) throw new HttpError(404, "not_found", "Arquivo não encontrado.");
  let content;
  try {
    content = await readFile(absolute);
  } catch (error) {
    if (error.code === "ENOENT") throw new HttpError(404, "not_found", "Arquivo não encontrado.");
    throw error;
  }
  const contentType = relative.endsWith(".html") ? "text/html; charset=utf-8"
    : relative.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8";
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff"
  });
  response.end(request.method === "HEAD" ? undefined : content);
}

async function handleRequest(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApi(request, response, url);
    if (handled !== false) return;
    throw new HttpError(404, "not_found", "Endpoint não encontrado.");
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(405, "method_not_allowed", "Método não permitido.");
  }
  return serveStatic(request, response, url.pathname);
}

async function start() {
  const schema = await readFile(path.join(ROOT, "db/schema.sql"), "utf8");
  await pool.query(schema);
  const server = createServer((request, response) => {
    handleRequest(request, response).catch(error => {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      if (error instanceof InputError) {
        return sendJson(response, 400, { error: { code: "invalid_input", message: error.message } });
      }
      if (error instanceof HttpError) {
        return sendJson(response, error.status, { error: { code: error.code, message: error.message } });
      }
      if (error.code === "23503") {
        return sendJson(response, 404, { error: { code: "appointment_not_found", message: "O agendamento associado não existe." } });
      }
      console.error("Falha ao processar requisição.", error);
      return sendJson(response, 500, { error: { code: "internal_error", message: "Erro interno ao processar a requisição." } });
    });
  });
  const port = Number(process.env.PORT) || 8000;
  const host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () => console.log(`Mascavo Pizzas ouvindo em http://${host}:${port}`));
  const shutdown = () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch(async error => {
  console.error("Não foi possível iniciar o backend PostgreSQL.", error);
  await pool.end();
  process.exitCode = 1;
});
