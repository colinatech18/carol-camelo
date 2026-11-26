// Duplica src/lib/criticality.ts's APP_TIMEZONE de propósito: este arquivo é
// importado por api/appointments/create.ts, e todo import em api/ precisa
// usar extensão .js, nunca .ts (ver tests/apiImportsNoTsExtension.test.mjs) —
// então não pode reexportar a constante de src/lib com import .ts explícito.
const APP_TIMEZONE = "America/Sao_Paulo";

function formatParts(iso: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  return (type: string) => parts.find((p) => p.type === type)?.value ?? "";
}

export function formatAppointmentDate(iso: string): string {
  const get = formatParts(iso);
  return `${get("weekday")}, ${get("day")}/${get("month")}`;
}

export function formatAppointmentTime(iso: string): string {
  const get = formatParts(iso);
  return `${get("hour")}:${get("minute")}`;
}

export function formatAppointmentDateTime(iso: string): string {
  const get = formatParts(iso);
  return `${get("weekday")}, ${get("day")}/${get("month")} às ${get("hour")}:${get("minute")}`;
}
