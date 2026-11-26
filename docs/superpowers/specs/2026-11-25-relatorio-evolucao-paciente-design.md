# Relatório de evolução do paciente (PDF) — Design

## Intenção e porquê

Hoje, quando a equipe clínica quer compartilhar o progresso de um paciente com o
cliente (ex. ao fim do programa de 30 dias, ou a qualquer momento durante ele),
não existe nenhum mecanismo de exportação — os dados de evolução só existem na
tela (`/pacientes/$id`, aba "Evolução"). A equipe precisa de um botão que gere
um PDF client-facing com o gráfico de evolução do paciente, para baixar e
enviar manualmente (e-mail/WhatsApp, pelos canais que já usam hoje).

## Objetivos

- Botão "Emitir relatório" na página de detalhe do paciente
  (`src/routes/_app.pacientes.$id.tsx`), ao lado das ações existentes.
- Gera um PDF contendo: identificação do paciente, resumo do período
  (data de início, dia atual do programa, criticalidade) e o gráfico de
  evolução dia a dia (programDay × média da escala), com faixas de fundo
  vermelho/amarelo/verde baseadas nos limiares de `clinicalConfig` (ver
  nota de correção abaixo).
- Disponível a qualquer momento do programa, não só ao completar os 30 dias
  (pode gerar um relatório parcial).
- 100% client-side — sem nova infraestrutura de servidor.

## Não-objetivos

- Envio automático (e-mail/WhatsApp) — o PDF é baixado e enviado manualmente
  pela equipe, pelos canais que já usam.
- Inclusão de trechos do prontuário clínico (`prontuario_notes`) ou da lista
  de consultas (`appointments`) — fica só identificação + resumo + gráfico.
- Qualquer automação de "programa concluído" (transição de `status`,
  gatilho de cron) — fora de escopo; o botão funciona com os dados que
  existirem no momento, completos ou parciais.
- Registro/log de quando e para quem um relatório foi emitido — não
  persistimos isso nesta versão.

## Anti-objetivos

- O relatório não deve, por omissão de revisão futura, passar a incluir
  conteúdo clínico sensível (prontuário) sem uma decisão explícita e
  consciente sobre privacidade/LGPD — este design deliberadamente mantém
  esse conteúdo de fora.
- Não deve exigir nova infraestrutura de servidor (o app roda em Cloudflare
  Workers via TanStack Start SSR; renderização server-side de PDF, ex.
  Puppeteer, adicionaria complexidade de infra desproporcional ao escopo).

## Restrições

- Geração deve ocorrer no browser (client-side), sem backend novo.
- Deve reaproveitar a lógica de dados já existente em `src/lib/criticality.ts`
  (`averageOfEntry`, `programDay`, `criticalityFromResponses`, limiares de
  `clinicalConfig`) — nenhum novo pipeline de dados.
- Deve reaproveitar a marca da clínica (`src/lib/clinicBranding.ts`) para
  logo/cabeçalho.
- pt-BR em todo o documento (datas via `date-fns` + `ptBR`, mesmas convenções
  de fuso horário de Brasília já usadas em `criticality.ts`).
- Nova dependência (`@react-pdf/renderer`) está sujeita ao guard de 24h
  (`minimumReleaseAge`) do `bunfig.toml` — ao instalar, confirmar que a
  versão escolhida não é recém-publicada (é uma lib estável e madura, não
  deve ser um problema, mas o builder deve checar antes de rodar o install).

## Abordagens consideradas

1. **`window.print()` + CSS de impressão.** Zero dependências novas, mas o
   resultado varia por navegador/driver de PDF e dá pouco controle de
   layout. Rejeitada: o documento vai para fora da clínica e precisa de
   aparência consistente e profissional.
2. **`jsPDF` + `html2canvas`** (capturando o gráfico Recharts já existente
   como imagem). Rápido de montar e reaproveita o visual exato da tela, mas
   o resultado é rasterizado (perde nitidez ao ampliar/imprimir) e tem
   problemas conhecidos de paginação. Rejeitada pelo mesmo motivo acima.
3. **`@react-pdf/renderer`, redesenhando o gráfico com as primitivas SVG
   próprias da lib** (`Svg`/`Path`/`Line`/`Text`) — escolhida. 100%
   client-side, PDF vetorial (nítido, arquivo leve), sem infra nova. Custo:
   é uma segunda implementação visual do gráfico (não é o componente
   Recharts da tela), mas alimentada pelos mesmos dados.

   **Correção pós-revisão:** a redação original deste doc dizia que o
   gráfico do PDF reaproveitaria "as mesmas faixas vermelho/amarelo/verde
   já usadas na tela" — isso está errado. O gráfico de evolução da página
   do paciente (`_app.pacientes.$id.tsx`) hoje é uma linha de cor única,
   sem faixas; as faixas de fundo (`ReferenceArea`) só existem no gráfico
   agregado do dashboard (`_app.dashboard.tsx`). O usuário confirmou que
   quer essas faixas no PDF mesmo assim (zonas horizontais estáticas por
   `clinicalConfig.criticalityRedMax`/`criticalityYellowMax`, no estilo do
   dashboard) — é um elemento novo no gráfico do paciente, não uma reutilização
   do que já existe na tela dele.
4. **Renderização server-side (função serverless com Puppeteer).** Rejeitada:
   adiciona complexidade real de infraestrutura (cold start, binário do
   Chromium) para algo que é viável inteiramente no client.

## Decisões já tomadas (pelo usuário)

- **Entrega:** botão na página do paciente gera o PDF para download; sem
  envio automático.
- **Conteúdo:** identificação do paciente + resumo do período (início, dia
  atual/30, criticalidade) + gráfico de evolução. Sem prontuário, sem lista
  de consultas.
- **Disponibilidade:** botão sempre visível/habilitado, mesmo antes de
  completar os 30 dias.
- **Biblioteca:** `@react-pdf/renderer`, com o gráfico redesenhado em SVG
  vetorial (abordagem 3 acima).

## O que fica a cargo de quem implementar

- **Escopo da identificação do paciente** (minha chamada, seguindo a mesma
  cautela de exposição de dados já adotada para prontuário/consultas):
  nome do paciente + data de início do programa, apenas. Sem e-mail,
  WhatsApp ou nome do profissional responsável no cabeçalho — são dados
  que não agregam ao propósito do documento (mostrar a evolução) e
  ampliam desnecessariamente o que circula fora da clínica.
- **Layout exato do PDF** (margens, tipografia, posição do cabeçalho/logo) —
  seguir a linguagem visual do app (cor primária via CSS var, logo de
  `clinicBranding.ts`), mas resolvida para valores estáticos no momento da
  geração: `@react-pdf/renderer` não lê CSS vars em runtime, então as cores
  de marca/faixas (`var(--primary)`, `var(--success)`, etc.) precisam ser
  lidas via `getComputedStyle` no momento de gerar o PDF ou ter um fallback
  hexadecimal fixo equivalente ao definido no tema.
- **Estrutura de componentes** sugerida: um componente de documento (ex.
  `src/components/patient-report/PatientReportDocument.tsx`, usando
  `Document`/`Page` do react-pdf) + um subcomponente para o gráfico,
  disparado por um botão que chama `pdf(...).toBlob()` e aciona o download
  no browser, com nome de arquivo tipo
  `relatorio-{nome-do-paciente}-{data}.pdf`.
- **Rótulo de relatório parcial:** por padrão, quando `programDay < 30`
  (ou `clinicalConfig.programLengthDays`), o relatório deve indicar
  visualmente que é um retrato parcial (ex. "Dia 14 de 30 — relatório
  parcial"); quando o programa está completo, omitir esse rótulo. Esta é
  uma decisão de UI que tomo por padrão — ajustável se a equipe preferir
  outro texto.
- **Fontes:** usar as fontes padrão do `@react-pdf/renderer` (Helvetica) na
  v1, em vez de registrar fontes customizadas — evita complexidade extra;
  revisitar se a identidade visual exigir uma fonte de marca específica.
- **Caso sem dados suficientes:** se o paciente não tiver nenhuma resposta
  pontuável (`responses` vazio ou sem valores de escala), o relatório deve
  mostrar uma mensagem tipo "Sem dados suficientes para gerar o gráfico de
  evolução" no lugar do gráfico, em vez de uma área vazia ou erro.
