/**
 * Store de atividades, persistido no Supabase (tabela `activities`). Mesmo
 * padrão de `forms-store.ts` (fonte de verdade é o Supabase, não localStorage),
 * reaproveitando o mesmo tipo `FormField` do editor de perguntas de
 * Formulários — ver src/components/FormFieldsEditor.tsx.
 *
 * Disparo é só manual (botão "Enviar agora") — sem agendamento nem
 * recorrência: isso exigiria um gatilho periódico externo (cron no n8n) só
 * pra decidir "chegou a hora", e a equipe decidiu que clicar manualmente é
 * suficiente por enquanto.
 */
import { supabase } from "@/lib/supabase";
import type { FormField } from "@/lib/forms-store";

export type ActivityStatus = "active" | "draft" | "archived";
export type TargetMode = "all_active" | "selected";

export interface ActivityDef {
  id: string;
  name: string;
  description: string;
  status: ActivityStatus;
  fields: FormField[];
  createdAt: string;

  targetMode: TargetMode;
  targetPatientIds: string[];

  messageTemplate: string;
  /**
   * Template aprovado na Meta usado fora da janela de 24h, cadastrado em
   * Configurações → Integrações (tabela `whatsapp_templates`). Cada atividade
   * tem o seu — diferente do template do lembrete do diário, já que o texto
   * de um template é fixo (aprovado previamente) e falaria do diário, não da
   * atividade. Nulo = fora da janela de 24h, o envio é pulado (skip
   * "no_template") até alguém configurar um.
   */
  whatsappTemplateId: string | null;
}

const uid = () => Math.random().toString(36).slice(2, 11);

function fromRow(row: any): ActivityDef {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    status: row.status,
    fields: (row.fields ?? []) as FormField[],
    createdAt: row.created_at,
    targetMode: row.target_mode ?? "all_active",
    targetPatientIds: row.target_patient_ids ?? [],
    messageTemplate: row.message_template ?? "",
    whatsappTemplateId: row.whatsapp_template_id ?? null,
  };
}

function toRow(a: ActivityDef) {
  return {
    name: a.name,
    description: a.description,
    status: a.status,
    fields: a.fields,
    target_mode: a.targetMode,
    target_patient_ids: a.targetMode === "selected" ? a.targetPatientIds : [],
    message_template: a.messageTemplate || null,
    whatsapp_template_id: a.whatsappTemplateId,
  };
}

export async function listActivities(): Promise<ActivityDef[]> {
  const { data, error } = await supabase.from("activities").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function getActivity(id: string): Promise<ActivityDef | undefined> {
  const { data, error } = await supabase.from("activities").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : undefined;
}

export async function createActivity(): Promise<ActivityDef> {
  const { data: sessionData } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("activities")
    .insert({
      name: "Nova atividade",
      description: "",
      status: "draft",
      fields: [],
      target_mode: "all_active",
      target_patient_ids: [],
      whatsapp_template_id: null,
      created_by: sessionData.session?.user.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function saveActivity(activity: ActivityDef): Promise<ActivityDef> {
  const { data, error } = await supabase
    .from("activities")
    .update({ ...toRow(activity), updated_at: new Date().toISOString() })
    .eq("id", activity.id)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from("activities").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "Não é possível excluir: esta atividade tem respostas ou envios registrados.",
      );
    }
    throw error;
  }
}

export async function duplicateActivity(id: string): Promise<ActivityDef> {
  const orig = await getActivity(id);
  if (!orig) throw new Error("Atividade não encontrada");
  const { data: sessionData } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("activities")
    .insert({
      ...toRow(orig),
      name: orig.name + " (cópia)",
      status: "draft",
      fields: orig.fields.map((f) => ({ ...f, id: "f_" + uid() })),
      created_by: sessionData.session?.user.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}
