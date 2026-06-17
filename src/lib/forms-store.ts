/**
 * Standalone forms store (multi-form builder).
 * Persisted in localStorage so the rest of the system is untouched.
 */

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
  | "file"
  | "photo"
  | "signature"
  | "section"
  | "instruction";

export type FormStatus = "active" | "draft" | "archived";

export interface FieldOption {
  id: string;
  label: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  required?: boolean;
  allowComment?: boolean;
  // text
  placeholder?: string;
  maxLength?: number;
  // number / money
  min?: number;
  max?: number;
  unit?: string;
  currency?: string;
  // scale
  minLabel?: string;
  maxLabel?: string;
  showNumbers?: boolean;
  // choice
  options?: FieldOption[];
  allowOther?: boolean;
  maxSelections?: number;
  // date
  dateMin?: string;
  dateMax?: string;
  // file / photo
  acceptedTypes?: string;
  maxSizeMb?: number;
  // signature
  penColor?: string;
}

export interface FormDef {
  id: string;
  name: string;
  description: string;
  status: FormStatus;
  createdAt: string;
  fields: FormField[];
}

const KEY = "mh.forms.v2";

const uid = () => Math.random().toString(36).slice(2, 11);

function defaultsFor(type: FieldType): Partial<FormField> {
  switch (type) {
    case "scale":
      return { min: 1, max: 5, minLabel: "Muito ruim", maxLabel: "Excelente", showNumbers: true };
    case "emoji_scale":
      return { options: ["😞", "😐", "🙂", "😊", "😄"].map((e) => ({ id: uid(), label: e })) };
    case "checkbox":
    case "radio":
    case "dropdown":
      return { options: [{ id: uid(), label: "Opção 1" }, { id: uid(), label: "Opção 2" }] };
    case "money":
      return { currency: "BRL" };
    case "file":
      return { acceptedTypes: "PDF, JPG, PNG", maxSizeMb: 10 };
    case "photo":
      return { acceptedTypes: "JPG, PNG", maxSizeMb: 5 };
    case "signature":
      return { penColor: "#0f172a" };
    default:
      return {};
  }
}

export function createField(type: FieldType, label = ""): FormField {
  return {
    id: "f_" + uid(),
    type,
    label: label || labelForType(type),
    required: false,
    ...defaultsFor(type),
  };
}

export function labelForType(type: FieldType): string {
  return FIELD_META[type]?.label ?? type;
}

export const FIELD_META: Record<FieldType, { label: string; icon: string; category: "basic" | "choice" | "advanced" | "info" }> = {
  short_text: { label: "Texto curto", icon: "📝", category: "basic" },
  long_text: { label: "Texto longo", icon: "📄", category: "basic" },
  number: { label: "Número", icon: "🔢", category: "basic" },
  date: { label: "Data", icon: "📅", category: "basic" },
  time: { label: "Hora", icon: "🕐", category: "basic" },
  checkbox: { label: "Caixa de seleção", icon: "☑️", category: "choice" },
  radio: { label: "Múltipla escolha", icon: "🔘", category: "choice" },
  dropdown: { label: "Lista suspensa", icon: "📋", category: "choice" },
  scale: { label: "Escala", icon: "⭐", category: "choice" },
  emoji_scale: { label: "Escala de emoji", icon: "😊", category: "choice" },
  money: { label: "Dinheiro", icon: "💰", category: "advanced" },
  url: { label: "Site / URL", icon: "🌐", category: "advanced" },
  file: { label: "Arquivo", icon: "📎", category: "advanced" },
  photo: { label: "Foto", icon: "📷", category: "advanced" },
  signature: { label: "Assinatura", icon: "✍️", category: "advanced" },
  section: { label: "Título / Seção", icon: "💬", category: "info" },
  instruction: { label: "Instrução", icon: "ℹ️", category: "info" },
};

function seed(): FormDef[] {
  const now = new Date().toISOString();
  return [
    {
      id: "form_daily",
      name: "Acompanhamento Diário",
      description: "Formulário padrão dos 30 dias do programa.",
      status: "active",
      createdAt: now,
      fields: [
        { ...createField("scale", "Como você dormiu na última noite?") },
        { ...createField("scale", "Houve pico de ansiedade ontem?") },
        { ...createField("scale", "Como está seu nível de energia hoje?") },
        { ...createField("scale", "Como foi sua alimentação?") },
        { ...createField("scale", "Como você avalia seu humor geral?") },
        { ...createField("long_text", "Gostaria de compartilhar algo mais?"), required: false, placeholder: "Opcional" },
      ],
    },
    {
      id: "form_initial",
      name: "Avaliação Inicial",
      description: "Aplicado na primeira consulta.",
      status: "active",
      createdAt: now,
      fields: [
        { ...createField("long_text", "Qual é o seu principal motivo para buscar acompanhamento?"), required: true },
        { ...createField("radio", "Você faz uso de alguma medicação atualmente?"), options: [{ id: uid(), label: "Sim" }, { id: uid(), label: "Não" }], required: true },
        { ...createField("short_text", "Se sim, qual medicação e dosagem?") },
        {
          ...createField("dropdown", "Com que frequência você pratica atividade física?"),
          options: ["Nunca", "1-2x por semana", "3-4x por semana", "Todos os dias"].map((l) => ({ id: uid(), label: l })),
        },
        { ...createField("scale", "Como você avalia sua qualidade de sono atualmente?") },
        { ...createField("number", "Peso atual"), unit: "kg", min: 0, max: 500 },
        {
          ...createField("dropdown", "Há quanto tempo você sente esses sintomas?"),
          options: ["Menos de 1 mês", "1–6 meses", "6–12 meses", "Mais de 1 ano"].map((l) => ({ id: uid(), label: l })),
        },
        { ...createField("file", "Anexe exames recentes, se houver"), acceptedTypes: "PDF, JPG, PNG", maxSizeMb: 10 },
      ],
    },
    {
      id: "form_final",
      name: "Avaliação Final",
      description: "Aplicado na última consulta.",
      status: "draft",
      createdAt: now,
      fields: [],
    },
  ];
}

export function loadForms(): FormDef[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    const s = seed();
    localStorage.setItem(KEY, JSON.stringify(s));
    return s;
  }
  try { return JSON.parse(raw) as FormDef[]; } catch { return []; }
}

export function saveForms(forms: FormDef[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(forms));
}

export function getForm(id: string): FormDef | undefined {
  return loadForms().find((f) => f.id === id);
}

export function upsertForm(form: FormDef) {
  const all = loadForms();
  const idx = all.findIndex((f) => f.id === form.id);
  if (idx >= 0) all[idx] = form; else all.push(form);
  saveForms(all);
}

export function deleteForm(id: string) {
  saveForms(loadForms().filter((f) => f.id !== id));
}

export function duplicateForm(id: string): FormDef | undefined {
  const all = loadForms();
  const orig = all.find((f) => f.id === id);
  if (!orig) return;
  const copy: FormDef = {
    ...orig,
    id: "form_" + uid(),
    name: orig.name + " (cópia)",
    status: "draft",
    createdAt: new Date().toISOString(),
    fields: orig.fields.map((f) => ({ ...f, id: "f_" + uid() })),
  };
  all.push(copy);
  saveForms(all);
  return copy;
}

export function newEmptyForm(): FormDef {
  const f: FormDef = {
    id: "form_" + uid(),
    name: "Novo formulário",
    description: "",
    status: "draft",
    createdAt: new Date().toISOString(),
    fields: [],
  };
  const all = loadForms();
  all.push(f);
  saveForms(all);
  return f;
}

export const newId = uid;
