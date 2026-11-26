# Variáveis de template de WhatsApp — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar às variáveis de template de WhatsApp fontes concretas que hoje faltam (data e
hora da consulta separadas, nome do profissional) e uma fonte de texto fixo, mantendo 100% de
compatibilidade com os templates já cadastrados.

**Architecture:** `api/_lib/whatsappTemplate.ts` ganha 4 novos valores de `source` e um campo
opcional `value` (texto fixo); `api/appointments/create.ts` passa a buscar o nome do
profissional (tabela `profiles`) e a formatar data/hora separadamente via um novo módulo puro
`api/_lib/appointmentDateTimeFormat.ts`; a tela de Configurações ganha os 4 novos itens no
seletor de fonte e um campo de texto extra para a fonte "Texto fixo".

**Tech Stack:** TypeScript, React (TanStack Start/Vite SPA), Supabase, Vercel serverless
functions (`api/`), `node:test` para lógica pura.

**Spec:** `docs/superpowers/specs/2026-11-25-variaveis-template-whatsapp-design.md`

## Global Constraints

- `whatsapp_templates.parameters` é uma coluna jsonb — adicionar novos valores de `source` e o
  campo `value` **não exige nenhuma migração** de banco.
- `appointment_datetime` continua existindo e resolvendo exatamente como hoje — templates já
  cadastrados não podem quebrar.
- Toda fonte sem dado disponível no contexto do envio resolve para `""`, nunca lança exceção —
  todo branch do switch em `buildTemplatePayload` cai em fallback `""`.
- Rótulos novos em `SOURCE_LABEL`, pt-BR, curtos, no estilo dos já existentes, com exatamente
  este texto: `appointment_date` → "Data da consulta", `appointment_time` → "Hora da consulta",
  `professional_name` → "Nome do profissional", `custom_text` → "Texto fixo".
- Arquivos de lógica pura novos que precisam rodar sob `node --test` diretamente devem importar
  módulos locais do projeto com extensão `.ts` explícita (não `.js`) — `tsconfig.json` já tem
  `allowImportingTsExtensions: true`, e é o único estilo de import que o type-stripping nativo
  do Node resolve corretamente neste checkout (Node v26.13.1). Este é o mesmo padrão já usado em
  `src/lib/patientReport.ts`/`patientReportChart.ts`.
- `api/appointments/create.ts` (e qualquer outro arquivo em `api/`) continua importando módulos
  irmãos (`_lib/*`) com especificador de extensão `.js`, igual ao resto do código em `api/` —
  não mude o estilo de import deste arquivo.
- **Limitação de ambiente pré-existente, não relacionada a este plano (não tentar corrigir):**
  neste checkout, `node --test` não consegue importar nenhum arquivo `api/*.ts` que, por sua
  vez, importe módulos irmãos com especificador `.js` resolvendo para um arquivo `.ts` — isso já
  quebra hoje `tests/inbound.test.mjs` com `ERR_MODULE_NOT_FOUND` (confirmado rodando o teste
  antes deste plano), numa versão de Node em que esse recurso de conveniência parece ter
  regredido. Por isso, as mudanças de wiring em `api/appointments/create.ts` (Task 3) não têm
  teste automatizado `node --test` possível neste ambiente — verificação ali é por
  `npx tsc --noEmit` + revisão manual cuidadosa contra a seção Review Focus abaixo.

## Review Focus

1. Um template já cadastrado hoje, usando só `appointment_datetime`, continua resolvendo
   exatamente como antes — nenhuma regressão por causa das 3 fontes novas relacionadas a
   consulta.
2. Um template usado no fluxo de lembrete automático ou "reabrir conversa" (`dispatchReminders.ts`/
   `dispatchActivity.ts`/`messages/send-manual.ts`) que alguém mapeie por engano para
   `appointment_date`/`appointment_time`/`professional_name` resolve para `""`, nunca lança —
   esses fluxos nunca populam esses campos do ctx.
3. Uma consulta criada sem profissional atribuído (`professionalId: null`) continua sendo criada
   e o aviso por WhatsApp continua sendo enviado normalmente, com `professional_name` resolvendo
   para `""` — nunca bloqueia a criação da consulta.
4. `custom_text` resolve a partir do campo `value` do próprio parâmetro, independente do
   `parameter_name` escolhido, e um `value` ausente/vazio resolve para `""` (nunca a string
   literal `"undefined"`).
5. Um `professional_id` que não bate com nenhuma linha em `profiles` (profissional
   excluído/desativado) resolve `professional_name` para `""` e não lança nem bloqueia a criação
   da consulta/disparo do WhatsApp — mesmo contrato de "best-effort" que `sendAppointmentMessage`
   já tem hoje para os outros motivos de não-envio.

Itens 1, 2 e 4 ganham teste automatizado na Task 1. Itens 3 e 5 são verificados por
`tsc --noEmit` + revisão manual na Task 3, pela limitação de ambiente descrita acima.

---

### Task 1: Novas fontes em `api/_lib/whatsappTemplate.ts`

**Files:**
- Modify: `api/_lib/whatsappTemplate.ts` (todo o arquivo, 74 linhas)
- Test: `tests/whatsappTemplate.test.mjs` (novo)

**Interfaces:**
- Produces: `TemplateParamConfig.source` aceita também `"appointment_date" | "appointment_time" |
  "professional_name" | "custom_text"`; `TemplateParamConfig.value?: string`;
  `buildTemplatePayload(template, ctx)` aceita `ctx.appointmentDate?: string`,
  `ctx.appointmentTime?: string`, `ctx.professionalName?: string` (além dos já existentes
  `patientName`, `link?`, `appointmentDateTime?`). Consumido pela Task 3 (`create.ts`) e pela
  Task 4 (UI, que mantém seu próprio tipo `TemplateSource` espelhado, sem importar deste
  arquivo — mesmo desacoplamento que já existe hoje entre os dois arquivos).

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/whatsappTemplate.test.mjs`:

```js
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
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test tests/whatsappTemplate.test.mjs`
Expected: FAIL nos testes de `appointment_date`/`appointment_time`/`professional_name`/
`custom_text` (os de `patient_first_name`/`patient_full_name`/`form_link`/`appointment_datetime`
já devem passar hoje — eles cobrem comportamento que já existe, servindo de guarda de
regressão).

- [ ] **Step 3: Implementar em `api/_lib/whatsappTemplate.ts`**

Estender `TemplateParamConfig`:

```ts
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
```

Estender a assinatura de `buildTemplatePayload`:

```ts
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
)
```

Adicionar ao `switch (p.source)`, antes do `default`:

```ts
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
```

Não mexer em `renderTextTemplate` nem na sua assinatura (fora de escopo — ver Não-objetivos do
spec).

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/whatsappTemplate.test.mjs`
Expected: PASS em todos os 11 testes.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/whatsappTemplate.ts tests/whatsappTemplate.test.mjs
git commit -m "feat: add appointment date/time, professional name and custom text template sources"
```

---

### Task 2: Extrair formatação de data/hora em módulo puro testável

**Files:**
- Create: `api/_lib/appointmentDateTimeFormat.ts`
- Test: `tests/appointmentDateTimeFormat.test.mjs` (novo)

**Interfaces:**
- Produces: `formatAppointmentDate(iso: string): string`, `formatAppointmentTime(iso: string):
  string`, `formatAppointmentDateTime(iso: string): string`. Consumido pela Task 3.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/appointmentDateTimeFormat.test.mjs`:

```js
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
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test tests/appointmentDateTimeFormat.test.mjs`
Expected: FAIL com "Cannot find module" / export not found (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `api/_lib/appointmentDateTimeFormat.ts`**

```ts
import { APP_TIMEZONE } from "../../src/lib/criticality.ts";

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
  return `${formatAppointmentDate(iso)} às ${formatAppointmentTime(iso)}`;
}
```

Import de `APP_TIMEZONE` com extensão `.ts` explícita (ver Global Constraints) — mesmo padrão já
usado em `src/lib/patientReportChart.ts`.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/appointmentDateTimeFormat.test.mjs`
Expected: PASS nos 3 testes.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/appointmentDateTimeFormat.ts tests/appointmentDateTimeFormat.test.mjs
git commit -m "feat: extract appointment date/time formatting into a pure, testable module"
```

---

### Task 3: Buscar nome do profissional e usar as novas fontes em `api/appointments/create.ts`

**Files:**
- Modify: `api/appointments/create.ts` (todo o arquivo, 202 linhas)

**Interfaces:**
- Consumes: `formatAppointmentDate`/`formatAppointmentTime`/`formatAppointmentDateTime` (Task 2);
  `buildTemplatePayload`'s novo shape de `ctx` (Task 1).
- Produces: nada consumido por outra task — é o fim da cadeia de backend.

Sem teste automatizado possível para esta task neste ambiente (ver Global Constraints). Verificar
com `npx tsc --noEmit` e revisão manual contra os itens 3 e 5 da seção Review Focus.

- [ ] **Step 1: Trocar o import e remover a função local de formatação**

Remover a função local `formatAppointmentDateTime` (linhas 17-29, incluindo seu comentário) e
remover o import, agora não usado em mais nenhum lugar deste arquivo, de
`import { APP_TIMEZONE } from "../../src/lib/criticality.js";` (linha 10). Adicionar no lugar:

```ts
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatAppointmentDateTime,
} from "../_lib/appointmentDateTimeFormat.js";
```

(especificador `.js`, igual a todos os outros imports deste arquivo — ver Global Constraints).

- [ ] **Step 2: Atualizar `sendAppointmentMessage` para receber `professionalId` e buscar o nome**

Nova assinatura:

```ts
async function sendAppointmentMessage(
  patient: PatientRow,
  scheduledAtIso: string,
  professionalId: string | null,
): Promise<{ messageSent: boolean; skipReason?: string }>
```

Trocar a linha `const appointmentDateTime = formatAppointmentDateTime(scheduledAtIso);` por:

```ts
const appointmentDate = formatAppointmentDate(scheduledAtIso);
const appointmentTime = formatAppointmentTime(scheduledAtIso);
const appointmentDateTime = formatAppointmentDateTime(scheduledAtIso);
```

(o uso em `renderTextTemplate(bodyTemplateText, { patientName: patient.name, appointmentDateTime
})`, logo abaixo, continua igual — fora de escopo).

Dentro do bloco `if (!withinWindow) { ... }`, depois de buscar `templateRow` com sucesso e antes
de chamar `buildTemplatePayload`, buscar o nome do profissional:

```ts
let professionalName = "";
if (professionalId) {
  const { data: professional, error: professionalError } = await supabaseAdmin
    .from("profiles")
    .select("name")
    .eq("id", professionalId)
    .maybeSingle();
  if (professionalError) {
    console.error("[appointments/create:professional]", professionalError);
  } else {
    professionalName = professional?.name ?? "";
  }
}
```

E atualizar a chamada de `buildTemplatePayload`:

```ts
templatePayload = buildTemplatePayload(templateRow as WhatsappTemplateRow, {
  patientName: patient.name,
  appointmentDateTime,
  appointmentDate,
  appointmentTime,
  professionalName,
});
```

- [ ] **Step 3: Repassar `professionalId` na chamada do handler**

Em `handler()`, trocar:

```ts
const dispatch = await sendAppointmentMessage(patient as PatientRow, scheduledAtIso);
```

por:

```ts
const dispatch = await sendAppointmentMessage(patient as PatientRow, scheduledAtIso, professionalId);
```

(`professionalId` já existe no escopo do handler, vindo do body da request — nenhuma outra
mudança necessária ali).

- [ ] **Step 4: Verificar com type-check**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo introduzido por este arquivo (erros pré-existentes no projeto, se
houver, não são deste escopo).

- [ ] **Step 5: Commit**

```bash
git add api/appointments/create.ts
git commit -m "feat: fetch professional name and pass separate date/time into appointment WhatsApp templates"
```

---

### Task 4: Fontes novas e campo de texto fixo na tela de Configurações

**Files:**
- Modify: `src/routes/_app.configuracoes.tsx:1094-1119` (tipos e rótulos) e `:1398-1425` (linha de
  parâmetro no dialog)

**Interfaces:**
- Este arquivo mantém seu próprio tipo `TemplateSource`/`TemplateParam`, espelhado do backend mas
  não importado dele (mesmo desacoplamento que já existe hoje). Não consome nem produz nada para
  as outras tasks.

Sem teste automatizado — é UI React dependente de Supabase/browser, mesma categoria das mudanças
de UI da feature anterior (relatório em PDF). Verificar com `npx tsc --noEmit`; teste manual real
no browser com Supabase configurado fica como pendência do usuário antes de produção, igual já
sinalizado para a feature anterior.

- [ ] **Step 1: Estender `TemplateSource`, `TemplateParam` e `SOURCE_LABEL`**

```ts
type TemplateSource =
  | "patient_first_name"
  | "patient_full_name"
  | "form_link"
  | "appointment_datetime"
  | "appointment_date"
  | "appointment_time"
  | "professional_name"
  | "custom_text";

interface TemplateParam {
  parameter_name: string;
  source: TemplateSource;
  value?: string;
}

const SOURCE_LABEL: Record<TemplateSource, string> = {
  patient_first_name: "Primeiro nome do paciente",
  patient_full_name: "Nome completo do paciente",
  form_link: "Link do formulário",
  appointment_datetime: "Data/hora da consulta agendada",
  appointment_date: "Data da consulta",
  appointment_time: "Hora da consulta",
  professional_name: "Nome do profissional",
  custom_text: "Texto fixo",
};
```

- [ ] **Step 2: Mostrar um campo de texto extra quando a fonte for "Texto fixo"**

Trocar o bloco `{form.parameters.map((p, idx) => ( <div key={idx} className="flex items-center
gap-2"> ... </div> ))}` (linhas 1398-1425) por:

```tsx
{form.parameters.map((p, idx) => (
  <div key={idx} className="space-y-1.5 rounded-md border p-2">
    <div className="flex items-center gap-2">
      <Input
        className="flex-1"
        placeholder="nome da variável (ex: nome)"
        value={p.parameter_name}
        onChange={(e) => updateParam(idx, { parameter_name: e.target.value })}
      />
      <Select
        value={p.source}
        onValueChange={(v) => updateParam(idx, { source: v as TemplateSource })}
      >
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(SOURCE_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="icon" variant="ghost" onClick={() => removeParam(idx)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
    {p.source === "custom_text" && (
      <Input
        placeholder="texto fixo a ser enviado (ex: Vera PSI)"
        value={p.value ?? ""}
        onChange={(e) => updateParam(idx, { value: e.target.value })}
      />
    )}
  </div>
))}
```

`updateParam` já aceita `Partial<TemplateParam>` genericamente (linha 1230) — nenhuma mudança
necessária nela.

- [ ] **Step 3: Verificar com type-check**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo introduzido por este arquivo.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_app.configuracoes.tsx
git commit -m "feat: add appointment date/time, professional name and custom text sources to the template editor UI"
```
