// Testa os handlers de api/forms/get-by-token.ts e api/forms/submit.ts direto,
// sem `vercel dev`, sem vite e sem yarn.
//
// Rodar:
//   node --env-file=.env.local scripts/test-forms-local.mjs
//
// O --env-file carrega SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ANTES dos handlers
// serem importados (o client Supabase é criado no topo de cada módulo).
//
// POR QUE O RESOLVER HOOK ABAIXO?
// Os handlers importam "../../src/lib/criticality" e "../../src/lib/formQuestions"
// SEM extensão — isso é resolvido pelo esbuild da Vercel, mas o ESM nativo do Node
// exige extensão explícita (senão: ERR_MODULE_NOT_FOUND). O hook síncrono appenda
// ".ts" a imports relativos sem extensão quando o arquivo existe. Assim NÃO precisamos
// modificar os handlers de produção só para o teste.
//
// ATENÇÃO: o teste (3) INSERE uma linha real em form_responses para o paciente do token.
// Depois de validar, apague essa linha no Supabase antes do commit
// (mesma rotina da tabela messages).

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[mc]?[jt]sx?$/.test(specifier)) {
      const candidate = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

// Guard de ambiente antes de importar os handlers (createClient lança se faltar env).
for (const v of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[v]) {
    console.error(`${v} ausente. Rode com: node --env-file=.env.local scripts/test-forms-local.mjs`);
    process.exit(1);
  }
}

// Import dinâmico DEPOIS de registrar o hook e checar o env.
const { default: getByToken } = await import("../api/forms/get-by-token.ts");
const { default: submit } = await import("../api/forms/submit.ts");

// Preencha com o public_token de um paciente real antes de rodar os testes (1), (3) e (4).
const PLACEHOLDER = "COLOQUE_TOKEN_REAL_AQUI";
const REAL_TOKEN = PLACEHOLDER;
const FAKE_TOKEN = "00000000-0000-0000-0000-000000000000"; // formato UUID válido, inexistente

const VALID_ANSWERS = [
  { questionId: "q1", value: 4 },
  { questionId: "q2", value: 2, note: "um pouco de ansiedade à noite" },
  { questionId: "q3", value: 3 },
  { questionId: "q4", value: 5 },
  { questionId: "q5", value: 4 },
];

// Inválido: questionId fora do whitelist (q99). A validação também barra value fora de 1-5.
const INVALID_ANSWERS = [
  { questionId: "q1", value: 4 },
  { questionId: "q99", value: 3 },
];

// req falso para GET (query param) e POST (body).
const getReq = (token) => ({ method: "GET", query: { token }, headers: {} });
const postReq = (body) => ({
  method: "POST",
  body,
  headers: { "content-type": "application/json" },
});

// res falso: .status(code) encadeável, .json(obj) imprime status + corpo.
function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(obj) {
      res.body = obj;
      console.log(`  status: ${res.statusCode}`);
      console.log(`  body:   ${JSON.stringify(obj)}`);
      return res;
    },
  };
  return res;
}

async function run(label, expected, handler, req) {
  console.log(`\n=== ${label} (espera ${expected}) ===`);
  const res = makeRes();
  try {
    await handler(req, res);
  } catch (err) {
    console.log(`  ERRO (exceção lançada): ${err?.message ?? err}`);
    return;
  }
  const ok = res.statusCode === expected;
  console.log(`  => ${ok ? "OK ✓" : "DIVERGENTE ✗"} (esperado ${expected}, obtido ${res.statusCode})`);
}

const HAS_REAL = REAL_TOKEN !== PLACEHOLDER;
if (!HAS_REAL) {
  console.log(
    "\n⚠️  REAL_TOKEN é placeholder — os testes (1), (3) e (4) serão pulados.\n" +
      "   Preencha REAL_TOKEN com o public_token de um paciente real para rodá-los.",
  );
}

// 1) token real -> 200 { patientId, name, programDay }
if (HAS_REAL) await run("(1) GET get-by-token token REAL", 200, getByToken, getReq(REAL_TOKEN));

// 2) token inexistente -> 404
await run("(2) GET get-by-token token INEXISTENTE", 404, getByToken, getReq(FAKE_TOKEN));

// 3) submit válido -> 200 { ok: true }  (GRAVA linha real em form_responses)
if (HAS_REAL)
  await run("(3) POST submit token REAL + answers válidos", 200, submit, postReq({ token: REAL_TOKEN, answers: VALID_ANSWERS }));

// 4) submit de novo, mesmo dia -> 409 (bloqueio de duplicidade)
if (HAS_REAL)
  await run("(4) POST submit DE NOVO, mesmo dia -> bloqueio", 409, submit, postReq({ token: REAL_TOKEN, answers: VALID_ANSWERS }));

// 5) answers inválido -> 400 (validação falha antes do lookup do token)
await run("(5) POST submit answers INVÁLIDO", 400, submit, postReq({ token: REAL_TOKEN, answers: INVALID_ANSWERS }));

console.log("\nFim. Se rodou o teste (3), apague a linha de teste em form_responses antes do commit.");
