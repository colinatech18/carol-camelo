/**
 * Store de formulários dinâmicos, persistido no Supabase (tabela `forms`).
 *
 * Antes era um builder standalone em localStorage (mh.forms.v2), sem nenhuma
 * ligação real com o formulário que o paciente respondia — que era sempre um
 * conjunto fixo de 5 perguntas (src/lib/formQuestions.ts, hoje obsoleto).
 * Agora os formulários criados aqui SÃO os formulários de verdade enviados
 * aos pacientes (ver api/forms/get-by-token.ts e api/forms/submit.ts).
 *
 * `file`, `photo` e `signature` foram removidos deste recorte: exigiriam
 * upload público por paciente sem sessão, com suas próprias questões de
 * bucket/RLS/validação de arquivo — tratado como funcionalidade separada.
 */
import { supabase } from "@/lib/supabase";

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
}

export interface FormDef {
  id: string;
  name: string;
  description: string;
  status: FormStatus;
  createdAt: string;
  fields: FormField[];
}

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

export const FIELD_META: Record<
  FieldType,
  { label: string; icon: string; category: "basic" | "choice" | "advanced" | "info" }
> = {
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
  section: { label: "Título / Seção", icon: "💬", category: "info" },
  instruction: { label: "Instrução", icon: "ℹ️", category: "info" },
};

function fromRow(row: any): FormDef {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    status: row.status,
    createdAt: row.created_at,
    fields: (row.fields ?? []) as FormField[],
  };
}

export async function listForms(): Promise<FormDef[]> {
  const { data, error } = await supabase.from("forms").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function getForm(id: string): Promise<FormDef | undefined> {
  const { data, error } = await supabase.from("forms").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : undefined;
}

export async function createForm(): Promise<FormDef> {
  const { data: sessionData } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("forms")
    .insert({
      name: "Novo formulário",
      description: "",
      status: "draft",
      fields: [],
      created_by: sessionData.session?.user.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function saveForm(form: FormDef): Promise<FormDef> {
  const { data, error } = await supabase
    .from("forms")
    .update({
      name: form.name,
      description: form.description,
      status: form.status,
      fields: form.fields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", form.id)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteForm(id: string): Promise<void> {
  const { error } = await supabase.from("forms").delete().eq("id", id);
  if (error) {
    // 23503 = violação de FK: o formulário tem respostas registradas, ou está
    // definido como padrão do sistema, ou atribuído a algum paciente.
    if (error.code === "23503") {
      throw new Error(
        "Não é possível excluir: este formulário tem respostas registradas, está " +
          "atribuído a algum paciente, ou é o formulário padrão do sistema.",
      );
    }
    throw error;
  }
}

export async function duplicateForm(id: string): Promise<FormDef> {
  const orig = await getForm(id);
  if (!orig) throw new Error("Formulário não encontrado");
  const { data: sessionData } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("forms")
    .insert({
      name: orig.name + " (cópia)",
      description: orig.description,
      status: "draft",
      fields: orig.fields.map((f) => ({ ...f, id: "f_" + uid() })),
      created_by: sessionData.session?.user.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export const newId = uid;