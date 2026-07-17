import type { Question } from "@/types";

/**
 * Perguntas fixas do diário de evolução (escala 1–5).
 *
 * Antes eram semeadas no mock (mockBackend.ts) e lidas via `api.forms.getQuestions`.
 * Agora esta constante é a fonte única e estática, consumida diretamente pelo
 * formulário público e usada no servidor (api/forms/submit.ts) para validar os IDs.
 * Manter `id` e `order` em sincronia com o schema jsonb de `form_responses.responses`.
 */
export const FORM_QUESTIONS: Question[] = [
  { id: "q1", text: "Como você dormiu na última noite?", order: 0 },
  { id: "q2", text: "Houve pico de ansiedade ontem?", order: 1 },
  { id: "q3", text: "Como está seu nível de energia hoje?", order: 2 },
  { id: "q4", text: "Como foi sua alimentação?", order: 3 },
  { id: "q5", text: "Como você avalia seu humor geral?", order: 4 },
];

/** IDs válidos, derivados da constante — usados na validação do submit. */
export const VALID_QUESTION_IDS: string[] = FORM_QUESTIONS.map((q) => q.id);
