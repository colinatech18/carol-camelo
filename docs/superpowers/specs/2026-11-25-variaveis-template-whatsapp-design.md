# Variáveis de template de WhatsApp — Design

## Intenção e porquê

Ao cadastrar um template aprovado na Meta (tela Configurações > Templates de
WhatsApp), cada variável do texto (`{{nome}}`, `{{data}}`, `{{hora}}`,
`{{profissional}}`...) precisa ser mapeada para uma "fonte" de dado real. Hoje
só existem 4 fontes possíveis, fixas no código
(`src/routes/_app.configuracoes.tsx:1094`): primeiro nome do paciente, nome
completo, link do formulário e "data/hora da consulta" (combinados num único
texto). Isso é insuficiente: não existe uma fonte só para a hora (separada da
data), nem para o nome do profissional da consulta — então, no exemplo do
print, `{{data}}` e `{{hora}}` acabam mapeados para o mesmo valor combinado
("quinta-feira, 13/11 às 09:00"), e `{{profissional}}` cai por padrão em
"Primeiro nome do paciente", que está errado.

## Objetivos

- Separar data e hora da consulta em duas fontes distintas.
- Adicionar uma fonte "Nome do profissional" (o profissional responsável pela
  consulta agendada).
- Adicionar uma fonte "Texto fixo", onde quem cadastra o template digita o
  valor literal ali mesmo — pra variáveis que não mudam por paciente (nome da
  clínica, um aviso fixo, etc.) sem precisar de um deploy toda vez que surgir
  uma variável nova desse tipo.
- Manter 100% compatível com templates já cadastrados hoje (a fonte
  `appointment_datetime` continua existindo e funcionando).

## Não-objetivos

- Não vamos construir um sistema genérico de "qualquer campo" (tipo
  `paciente.email` ou `consulta.observacoes` via expressão) — as fontes
  continuam sendo uma lista fechada, só que maior. Ver seção Abordagens.
- Não mexe no editor de texto livre (`renderTextTemplate`/`{{name}}`,
  `{{link}}`, `{{datetime}}`, usado pelo lembrete automático e por "Enviar
  modelo" quando a mensagem é de texto puro, não um template Meta) — a
  limitação reportada é especificamente no cadastro de templates Meta.
- Não adiciona "nome do profissional" como fonte disponível para os templates
  de lembrete/reabertura de conversa — esses fluxos não têm nenhuma consulta
  nem profissional associado no momento do envio, só o template de aviso de
  consulta agendada (`appointment_template_id`) tem esse dado disponível.

## Restrições

- `whatsapp_templates.parameters` já é uma coluna jsonb livre — adicionar
  novas fontes, e um campo novo `value` (pro texto fixo), não exige migração
  de banco, só muda o shape do JSON salvo (mesmo princípio já documentado em
  `api/_lib/whatsappTemplate.ts`: "cadastrar uma fonte nova não exige mudança
  de schema").
- O profissional da consulta (`professional_id`) já é salvo em `appointments`
  hoje, mas nunca é buscado nem repassado na hora de montar a mensagem
  (`api/appointments/create.ts` só carrega `patient`) — isso precisa ser
  adicionado.
- `TemplateSource` e a função que resolve cada fonte em texto
  (`buildTemplatePayload`) são compartilhados por todos os templates
  (lembrete, reabertura, consulta) — uma fonte sem dado disponível no
  contexto daquele envio (ex. "Nome do profissional" usado num template de
  lembrete) deve resolver pra string vazia, nunca quebrar o envio (mesmo
  comportamento que `link`/`appointmentDateTime` já têm hoje com `?? ""`).

## Abordagens consideradas

1. **Lista fechada maior, só com as fontes concretas que faltam** (separar
   data/hora, nome do profissional) — simples, mesmo padrão tipado de hoje,
   mas qualquer necessidade nova no futuro (nome da clínica, telefone, etc.)
   ainda exige mexer em 3 lugares de código (enum na tela, switch no backend,
   e threading do dado real em cada call site).
2. **Lista fechada + uma fonte "texto fixo"** (escolhida) — resolve o caso
   concreto de hoje (data/hora separadas, profissional) do mesmo jeito da
   opção 1, e cobre variáveis futuras que sejam só texto estático sem
   precisar de deploy. Custo baixo: um campo opcional a mais no formulário e
   no JSON salvo.
3. **Sistema genérico de tokens/expressões** (ex. `paciente.email`,
   `consulta.profissional.nome`), resolvido contra um contexto montado
   dinamicamente em cada call site — rejeitada: complexidade desproporcional
   (precisaria documentar quais campos existem em cada contexto de envio,
   tratar erro de referência a campo inexistente, etc.) pra uma necessidade
   que, pelo uso real do app, é de poucas variáveis bem conhecidas.

## Decidido (pelo usuário)

Implementar as abordagens 1 e 2 juntas: as fontes concretas que faltam
(data/hora separadas, nome do profissional) **e** a fonte de texto fixo.

## O que fica a cargo de quem implementar

- **Novas fontes em `TemplateSource`** (`src/routes/_app.configuracoes.tsx`) e
  no tipo espelho em `api/_lib/whatsappTemplate.ts`:
  `appointment_date` ("Data da consulta"), `appointment_time` ("Hora da
  consulta"), `professional_name` ("Nome do profissional"), `custom_text`
  ("Texto fixo"). `appointment_datetime` continua existindo (compatibilidade).
- **Campo `value?: string`** em `TemplateParam`/`TemplateParamConfig`, usado
  só quando `source === "custom_text"`; a UI mostra um campo de texto extra
  nessa linha quando essa fonte está selecionada (ex. ao lado ou abaixo do
  seletor de fonte), salvando o literal digitado.
- **`buildTemplatePayload`**: resolve `appointment_date`/`appointment_time` a
  partir de dois novos campos do `ctx` (`appointmentDate?: string`,
  `appointmentTime?: string`), `professional_name` a partir de
  `ctx.professionalName?: string`, e `custom_text` a partir de `p.value`.
  Campo de contexto ausente → string vazia, nunca erro.
- **`api/appointments/create.ts`**: dividir `formatAppointmentDateTime` em
  duas funções (ex. `formatAppointmentDate` → "quinta-feira, 13/11",
  `formatAppointmentTime` → "09:00"), manter a combinada pra
  `appointment_datetime`/`{{datetime}}` não quebrar. Buscar o nome do
  profissional (tabela `profiles`, por `professional_id`, mesmo padrão já
  usado em `_app.pacientes.$id.tsx`) quando houver `professionalId`, e
  repassar pro `ctx` de `buildTemplatePayload`. Sem profissional atribuído →
  string vazia.
- **Rótulos (`SOURCE_LABEL`)**: nomes curtos e claros em pt-BR pros 4 itens
  novos, seguindo o estilo dos já existentes.
