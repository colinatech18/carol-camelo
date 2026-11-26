// Testes de lógica pura para api/_lib/appointmentDateTimeFormat.ts — sem mocks, sem banco.
// Runner nativo do Node (node:test).
//
// Rodar:  node --test tests/appointmentDateTimeFormat.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatAppointmentDateTime,
} from "../api/_lib/appointmentDateTimeFormat.ts";

const ISO = "2026-11-12T12:00:00.000Z"; // quinta-feira, 12/11, 09:00 em Brasília (UTC-3)

test("formatAppointmentDate returns weekday + day/month in Brasília time", () => {
  assert.equal(formatAppointmentDate(ISO), "quinta-feira, 12/11");
});

test("formatAppointmentTime returns HH:mm in Brasília time", () => {
  assert.equal(formatAppointmentTime(ISO), "09:00");
});

test("formatAppointmentDateTime combines date and time exactly as the previous combined format", () => {
  assert.equal(formatAppointmentDateTime(ISO), "quinta-feira, 12/11 às 09:00");
});
