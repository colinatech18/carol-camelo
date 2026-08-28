export type FieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "date"
  | "time"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "scale"
  | "emoji_scale"
  | "money"
  | "url"
  | "section"
  | "instruction";

export interface FieldOption {
  id: string;
  label: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  allowComment?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: FieldOption[];
  allowOther?: boolean;
  maxSelections?: number;
  dateMin?: string;
  dateMax?: string;
}

export interface Answer {
  questionId: string;
  value: unknown;
  note?: string;
  // Marca respostas de campos tipo escala (scale/emoji_scale), usadas no
  // cálculo de criticidade (src/lib/criticality.ts). Ausente = tratado como
  // true, para não quebrar respostas históricas gravadas antes desta migração
  // (todas eram de campos de escala).
  isScale?: boolean;
}

const MAX_TEXT_LENGTH = 5000;
const MAX_NOTE_LENGTH = 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const OTHER_SENTINEL = "__other__";

function isAnswerable(type: FieldType): boolean {
  return type !== "section" && type !== "instruction";
}

const INVALID = Symbol("invalid");

function validateFieldValue(field: FormField, value: unknown): unknown | typeof INVALID {
  switch (field.type) {
    case "short_text":
    case "long_text":
    case "url": {
      if (typeof value !== "string") return INVALID;
      const max = Math.min(field.maxLength ?? MAX_TEXT_LENGTH, MAX_TEXT_LENGTH);
      if (value.length === 0 || value.length > max) return INVALID;
      if (field.type === "url" && !URL_RE.test(value)) return INVALID;
      return value;
    }
    case "number":
    case "money": {
      if (typeof value !== "number" || !Number.isFinite(value)) return INVALID;
      if (field.min !== undefined && value < field.min) return INVALID;
      if (field.max !== undefined && value > field.max) return INVALID;
      return value;
    }
    case "date": {
      if (typeof value !== "string" || !DATE_RE.test(value)) return INVALID;
      if (field.dateMin && value < field.dateMin) return INVALID;
      if (field.dateMax && value > field.dateMax) return INVALID;
      return value;
    }
    case "time": {
      if (typeof value !== "string" || !TIME_RE.test(value)) return INVALID;
      return value;
    }
    case "scale": {
      const min = field.min ?? 1;
      const max = field.max ?? 5;
      if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
        return INVALID;
      }
      return value;
    }
    case "emoji_scale": {
      const count = field.options?.length ?? 5;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > count) {
        return INVALID;
      }
      return value;
    }
    case "radio":
    case "dropdown": {
      if (typeof value !== "string") return INVALID;
      if (value === OTHER_SENTINEL && field.allowOther) return value;
      const ids = (field.options ?? []).map((o) => o.id);
      if (!ids.includes(value)) return INVALID;
      return value;
    }
    case "checkbox": {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) return INVALID;
      const ids = (field.options ?? []).map((o) => o.id);
      const allValid = value.every((v) => ids.includes(v) || (v === OTHER_SENTINEL && field.allowOther));
      if (!allValid) return INVALID;
      if (field.maxSelections && value.length > field.maxSelections) return INVALID;
      return value;
    }
    default:
      return INVALID;
  }
}

/**
 * Valida e normaliza um array de respostas contra a definição REAL do
 * formulário (vinda do servidor, nunca do cliente). Retorna as respostas
 * normalizadas, ou `null` se algo for inválido (campo obrigatório ausente,
 * tipo/formato errado, opção inexistente, etc.) — o chamador decide como
 * reagir (normalmente HTTP 400).
 */
export function validateFormAnswers(fields: FormField[], input: unknown): Answer[] | null {
  if (!Array.isArray(input)) return null;

  const answerable = fields.filter((f) => isAnswerable(f.type));
  const byId = new Map(answerable.map((f) => [f.id, f]));
  const provided = new Map<string, { value: unknown; note?: string }>();

  for (const item of input) {
    if (typeof item !== "object" || item === null) return null;
    const { questionId, value, note } = item as Record<string, unknown>;
    if (typeof questionId !== "string" || !byId.has(questionId)) return null;
    if (note !== undefined && (typeof note !== "string" || note.length > MAX_NOTE_LENGTH)) return null;
    provided.set(questionId, { value, note: note as string | undefined });
  }

  const out: Answer[] = [];
  for (const field of answerable) {
    const entry = provided.get(field.id);
    const empty =
      !entry ||
      entry.value === undefined ||
      entry.value === null ||
      entry.value === "" ||
      (Array.isArray(entry.value) && entry.value.length === 0);

    if (empty) {
      if (field.required) return null;
      continue; // campo opcional não respondido — não entra no resultado
    }

    const normalized = validateFieldValue(field, entry.value);
    if (normalized === INVALID) return null;

    const answer: Answer = { questionId: field.id, value: normalized };
    if (entry.note) answer.note = entry.note;
    if (field.type === "scale" || field.type === "emoji_scale") answer.isScale = true;
    if (field.type === "number" || field.type === "money") answer.isScale = false;
    out.push(answer);
  }

  return out;
}