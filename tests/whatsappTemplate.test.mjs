// Testes de lógica pura para api/_lib/whatsappTemplate.ts — sem mocks, sem banco.
// Runner nativo do Node (node:test).
//
// Rodar:  node --test tests/whatsappTemplate.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplatePayload } from "../api/_lib/whatsappTemplate.ts";

function template(parameters) {
  return { id: "t1", name: "consulta_agendada", language: "pt_BR", parameters };
}

test("resolves patient_first_name to the first word of patientName", () => {
  const payload = buildTemplatePayload(
    template([{ parameter_name: "nome", source: "patient_first_name" }]),
    { patientName: "Maria Silva" },
  );
  assert.equal(payload.components[0].parameters[0].text, "Maria");
});

test("resolves patient_full_name to the full patientName", () => {
  const payload = buildTemplatePayload(
    template([{ parameter_name: "nome", source: "patient_full_name" }]),
    { patientName: "Maria Silva" },
  );
  assert.equal(payload.components[0].parameters[0].text, "Maria Silva");
});

test("resolves form_link from ctx.link, empty string when absent", () => {
  const withLink = buildTemplatePayload(
    template([{ parameter_name: "link", source: "form_link" }]),
    { patientName: "Maria", link: "https://x.test/f/abc" },
  );
  assert.equal(withLink.components[0].parameters[0].text, "https://x.test/f/abc");

  const withoutLink = buildTemplatePayload(
    template([{ parameter_name: "link", source: "form_link" }]),
    { patientName: "Maria" },
  );
  assert.equal(withoutLink.components[0].parameters[0].text, "");
});

test("resolves appointment_datetime from ctx.appointmentDateTime (backward compatibility)", () => {
  const payload = buildTemplatePayload(
    template([{ parameter_name: "datahora", source: "appointment_datetime" }]),
    { patientName: "Maria", appointmentDateTime: "quinta-feira, 12/11 às 09:00" },
  );
  assert.equal(payload.components[0].parameters[0].text, "quinta-feira, 12/11 às 09:00");
});

test("resolves appointment_date from ctx.appointmentDate", () => {
  const payload = buildTemplatePayload(
    template([{ parameter_name: "data", source: "appointment_date" }]),
    { patientName: "Maria", appointmentDate: "quinta-feira, 12/11" },
  );
  assert.equal(payload.components[0].parameters[0].text, "quinta-feira, 12/11");
});

test("resolves appointment_time from ctx.appointmentTime", () => {
  const payload = buildTemplatePayload(
    template([{ parameter_name: "hora", source: "appointment_time" }]),
    { patientName: "Maria", appointmentTime: "09:00" },
  );
  assert.equal(payload.components[0].parameters[0].text, "09:00");
});

test("resolves professional_name from ctx.professionalName", () => {
  const payload = buildTemplatePayload(
    template([{ parameter_name: "profissional", source: "professional_name" }]),
    { patientName: "Maria", professionalName: "Dra. Carol Camelo" },
  );
  assert.equal(payload.components[0].parameters[0].text, "Dra. Carol Camelo");
});

test("resolves custom_text from the parameter's own value, ignoring ctx", () => {
  const payload = buildTemplatePayload(
    template([{ parameter_name: "clinica", source: "custom_text", value: "Vera PSI" }]),
    { patientName: "Maria" },
  );
  assert.equal(payload.components[0].parameters[0].text, "Vera PSI");
});

test("custom_text with no value set falls back to empty string, never throws", () => {
  const payload = buildTemplatePayload(
    template([{ parameter_name: "clinica", source: "custom_text" }]),
    { patientName: "Maria" },
  );
  assert.equal(payload.components[0].parameters[0].text, "");
});

test("appointment_date/appointment_time/professional_name fall back to empty string when ctx omits them (e.g. reminder/reopen templates)", () => {
  const payload = buildTemplatePayload(
    template([
      { parameter_name: "data", source: "appointment_date" },
      { parameter_name: "hora", source: "appointment_time" },
      { parameter_name: "profissional", source: "professional_name" },
    ]),
    { patientName: "Maria" },
  );
  assert.deepEqual(
    payload.components[0].parameters.map((p) => p.text),
    ["", "", ""],
  );
});

test("an unrecognized source falls back to empty string instead of throwing", () => {
  const payload = buildTemplatePayload(
    template([{ parameter_name: "x", source: "something_new" }]),
    { patientName: "Maria" },
  );
  assert.equal(payload.components[0].parameters[0].text, "");
});
