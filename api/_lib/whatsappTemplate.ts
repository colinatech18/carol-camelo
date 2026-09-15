export interface TemplateParamConfig {
  parameter_name: string;
  source: "patient_first_name" | "patient_full_name" | "form_link" | string;
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
 * `app_settings.reminder_template_id`/`reopen_template_id` pra ele NÃO exige
 * nenhuma mudança de código — só se precisar de uma fonte de variável nova
 * além de "patient_first_name" / "patient_full_name" / "form_link".
 */
export function buildTemplatePayload(
  template: WhatsappTemplateRow,
  ctx: { patientName: string; link: string },
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
        text = ctx.link;
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
 * verdade via template) substituindo {{name}} e {{link}}. */
export function renderTextTemplate(
  bodyTemplateText: string,
  ctx: { patientName: string; link: string },
): string {
  const firstName = ctx.patientName.trim().split(/\s+/)[0] ?? ctx.patientName;
  return bodyTemplateText
    .replace(/\{\{\s*name\s*\}\}/g, firstName)
    .replace(/\{\{\s*link\s*\}\}/g, ctx.link);
}