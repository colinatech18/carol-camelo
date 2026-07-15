// Teste de lógica para api/messages/inbound.ts — mocka o client do Supabase.
// NÃO toca no banco real. Runner nativo do Node (node:test) + mock.module.
//
// Rodar:  node --experimental-test-module-mocks --test tests/inbound.test.mjs
//
// Fica em tests/ (fora de api/) de propósito: tudo dentro de api/ vira função
// serverless na Vercel, e um *.test não deve virar endpoint.

import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Segredo do webhook usado nos casos de auth OK. Definido ANTES de importar o handler.
process.env.N8N_WEBHOOK_SECRET = "s3cret-teste";
process.env.SUPABASE_URL = "http://mock.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-key";

// Estado mutável que o client falso lê a cada request; reconfigurado por teste.
const state = {
  // resposta de .from("patients").select("id, phone") — lista de candidatos.
  patientLookup: { data: [], error: null },
  insertResult: { error: null }, // resposta de .from("messages").insert(...)
  inserted: [], // linhas capturadas que foram para insert()
};

function resetState() {
  state.patientLookup = { data: [], error: null };
  state.insertResult = { error: null };
  state.inserted = [];
}

// Client falso com a mesma cadeia usada pela função.
// A função agora faz .from("patients").select("id, phone") e filtra por dígitos no JS.
const fakeClient = {
  from(table) {
    if (table === "patients") {
      return {
        select() {
          return Promise.resolve(state.patientLookup);
        },
      };
    }
    if (table === "messages") {
      return {
        insert(row) {
          state.inserted.push(row);
          return Promise.resolve(state.insertResult);
        },
      };
    }
    throw new Error(`tabela inesperada no mock: ${table}`);
  },
};

// Intercepta o createClient ANTES de importar o handler (import dinâmico logo abaixo).
mock.module("@supabase/supabase-js", {
  exports: { createClient: () => fakeClient },
});

const { default: handler } = await import("../api/messages/inbound.ts");

const OK_HEADER = { "x-webhook-secret": "s3cret-teste" };

function makeReq({ method = "POST", headers = {}, body } = {}) {
  return { method, headers, body };
}

function makeRes() {
  const res = { statusCode: undefined, body: undefined };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (o) => {
    res.body = o;
    return res;
  };
  return res;
}

test("401 quando falta o header x-webhook-secret", async () => {
  resetState();
  const res = makeRes();
  await handler(
    makeReq({ headers: {}, body: { phone: "111", content: "oi", direction: "inbound" } }),
    res,
  );
  assert.equal(res.statusCode, 401);
  assert.equal(state.inserted.length, 0);
});

test("401 quando o x-webhook-secret está errado", async () => {
  resetState();
  const res = makeRes();
  await handler(
    makeReq({
      headers: { "x-webhook-secret": "errado" },
      body: { phone: "111", content: "oi", direction: "inbound" },
    }),
    res,
  );
  assert.equal(res.statusCode, 401);
  assert.equal(state.inserted.length, 0);
});

test("400 quando falta phone", async () => {
  resetState();
  const res = makeRes();
  await handler(makeReq({ headers: OK_HEADER, body: { content: "oi", direction: "inbound" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(state.inserted.length, 0);
});

test("400 quando phone não tem nenhum dígito", async () => {
  resetState();
  const res = makeRes();
  await handler(
    makeReq({ headers: OK_HEADER, body: { phone: "(--) ---", content: "oi", direction: "inbound" } }),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(state.inserted.length, 0);
});

test("400 quando falta content", async () => {
  resetState();
  const res = makeRes();
  await handler(makeReq({ headers: OK_HEADER, body: { phone: "111", direction: "inbound" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(state.inserted.length, 0);
});

test("400 quando direction está fora do enum", async () => {
  resetState();
  const res = makeRes();
  await handler(
    makeReq({ headers: OK_HEADER, body: { phone: "111", content: "oi", direction: "sideways" } }),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(state.inserted.length, 0);
});

test("200 + isPatient:true + patientId quando o telefone é de um paciente", async () => {
  resetState();
  // Paciente cadastrado com formatação (com +55, espaço e hífen).
  state.patientLookup = {
    data: [{ id: "uuid-paciente-123", phone: "+55 11 98888-7777" }],
    error: null,
  };
  const res = makeRes();
  await handler(
    makeReq({
      headers: OK_HEADER,
      body: { phone: "+5511988887777", content: "olá", direction: "inbound" },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, isPatient: true, patientId: "uuid-paciente-123" });
  // insert recebeu patient_id preenchido e o telefone NORMALIZADO (só dígitos).
  assert.equal(state.inserted.length, 1);
  assert.equal(state.inserted[0].patient_id, "uuid-paciente-123");
  assert.equal(state.inserted[0].phone, "5511988887777");
  assert.equal(state.inserted[0].direction, "inbound");
  assert.equal(state.inserted[0].content_type, "text"); // default
});

test("200 + isPatient:false + sem patientId quando o telefone não é paciente (lead)", async () => {
  resetState();
  state.patientLookup = { data: [], error: null };
  const res = makeRes();
  await handler(
    makeReq({
      headers: OK_HEADER,
      body: { phone: "+55 00 0000-0000", content: "quero saber mais", direction: "inbound", contentType: "image" },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, isPatient: false });
  assert.equal(Object.prototype.hasOwnProperty.call(res.body, "patientId"), false);
  // insert recebeu patient_id null, telefone normalizado e respeitou o contentType informado.
  assert.equal(state.inserted.length, 1);
  assert.equal(state.inserted[0].patient_id, null);
  assert.equal(state.inserted[0].phone, "550000000000");
  assert.equal(state.inserted[0].content_type, "image");
});

test("200 + isPatient:true mesmo quando a formatação recebida difere da cadastrada", async () => {
  resetState();
  // Paciente cadastrado como dígitos crus; a mensagem chega formatada.
  state.patientLookup = {
    data: [{ id: "uuid-nordeste-1", phone: "558498401484" }],
    error: null,
  };
  const res = makeRes();
  await handler(
    makeReq({
      headers: OK_HEADER,
      body: { phone: "+55 84 9840-1484", content: "oi", direction: "inbound" },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, isPatient: true, patientId: "uuid-nordeste-1" });
  assert.equal(state.inserted[0].patient_id, "uuid-nordeste-1");
  assert.equal(state.inserted[0].phone, "558498401484");
});

test("200 + isPatient:true quando chega COM 55 e o paciente está cadastrado SEM 55", async () => {
  resetState();
  // Paciente cadastrado sem o código do país (só DDD + número).
  state.patientLookup = {
    data: [{ id: "uuid-ddi-1", phone: "84999998888" }],
    error: null,
  };
  const res = makeRes();
  await handler(
    makeReq({
      headers: OK_HEADER,
      // WhatsApp entrega o número com 55 na frente.
      body: { phone: "5584999998888", content: "oi", direction: "inbound" },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, isPatient: true, patientId: "uuid-ddi-1" });
  assert.equal(state.inserted[0].patient_id, "uuid-ddi-1");
});

test("candidatos com phone null/vazio são ignorados e o match segue nos demais", async () => {
  resetState();
  state.patientLookup = {
    data: [
      { id: "sem-telefone", phone: null },
      { id: "telefone-vazio", phone: "" },
      { id: "uuid-real", phone: "84999998888" }, // este deve casar
    ],
    error: null,
  };
  const res = makeRes();
  await handler(
    makeReq({
      headers: OK_HEADER,
      body: { phone: "5584999998888", content: "oi", direction: "inbound" },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, isPatient: true, patientId: "uuid-real" });
  assert.equal(state.inserted[0].patient_id, "uuid-real");
});

test("lista só com candidato de phone null e telefone não-paciente não quebra (lead)", async () => {
  resetState();
  state.patientLookup = { data: [{ id: "sem-telefone", phone: null }], error: null };
  const res = makeRes();
  await handler(
    makeReq({
      headers: OK_HEADER,
      body: { phone: "5584111112222", content: "oi", direction: "inbound" },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, isPatient: false });
  assert.equal(state.inserted[0].patient_id, null);
});

test("405 quando o método não é POST", async () => {
  resetState();
  const res = makeRes();
  await handler(makeReq({ method: "GET", headers: OK_HEADER }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(state.inserted.length, 0);
});
