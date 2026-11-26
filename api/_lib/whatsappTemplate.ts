export interface TemplateParamConfig {
  parameter_name: string;
  source:
    | "patient_first_name"
    | "patient_full_name"
    | "form_link"
    | "appointment_datetime"
    | "appointment_date"
    | "appointment_time"
    | "professional_name"
    | "custom_text"
    | string;
  value?: string;
}

export interface WhatsappTemplateRow {
  id: string;
  name: string;
  language: string;
  parameters: TemplateParamConfig[];
}

/**
 * Resolve os valores de cada variável do template a partir da fonte
 * cadastrada (nome do paciente, link do formulário) e monta o objeto
 * "template" no formato exato que a API da Meta espera — com
 * `parameter_name`, porque o template aprovado usa variáveis NOMEADAS
 * (`{{nome}}`, `{{link}}`), não numeradas (`{{1}}`, `{{2}}`).
 *
 * Cadastrar um template novo em `whatsapp_templates` e apontar
 * `app_settings.reminder_template_id`/`reopen_template_id`/`appointment_template_id`
 * pra ele NÃO exige nenhuma mudança de código, desde que use só as fontes já
 * suportadas: "patient_first_name" / "patient_full_name" / "form_link" /
 * "appointment_datetime" / "appointment_date" / "appointment_time" /
 * "professional_name" / "custom_text" (texto digitado em `value`, no próprio
 * cadastro do parâmetro — não depende do contexto de envio).
 */
export function buildTemplatePayload(
  template: WhatsappTemplateRow,
  ctx: {
    patientName: string;
    link?: string;
    appointmentDateTime?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    professionalName?: string;
  },
) {
  const parameters = (template.parameters ?? []).map((p) => {
    let text = "";
    switch (p.source) {
      case "patient_first_name":
        text = ctx.patientName.trim().split(/\s+/)[0] ?? ctx.patientName;
        break;
      case "patient_full_name":
        text = ctx.patientName;
        break;
      case "form_link":
        text = ctx.link ?? "";
        break;
      case "appointment_datetime":
        text = ctx.appointmentDateTime ?? "";
        break;
      case "appointment_date":
        text = ctx.appointmentDate ?? "";
        break;
      case "appointment_time":
        text = ctx.appointmentTime ?? "";
        break;
      case "professional_name":
        text = ctx.professionalName ?? "";
        break;
      case "custom_text":
        text = p.value ?? "";
        break;
      default:
        text = "";
    }
    return { type: "text", parameter_name: p.parameter_name, text };
  });

  return {
    name: template.name,
    language: { code: template.language },
    components: [{ type: "body", parameters }],
  };
}

/** Renderiza o texto legível (usado só pro histórico/log, não pro envio de
 * verdade via template) substituindo {{name}}, {{link}} e {{datetime}}. */
export function renderTextTemplate(
  bodyTemplateText: string,
  ctx: { patientName: string; link?: string; appointmentDateTime?: string },
): string {
  const firstName = ctx.patientName.trim().split(/\s+/)[0] ?? ctx.patientName;
  return bodyTemplateText
    .replace(/\{\{\s*name\s*\}\}/g, firstName)
    .replace(/\{\{\s*link\s*\}\}/g, ctx.link ?? "")
    .replace(/\{\{\s*datetime\s*\}\}/g, ctx.appointmentDateTime ?? "");
}
