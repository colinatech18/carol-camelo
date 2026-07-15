// Testa o handler de api/messages/inbound.ts diretamente, sem `vercel dev`,
// sem vite e sem yarn. Node 24 tem type-stripping nativo, então dá pra importar
// o `.ts` direto de um `.mjs`.
//
// Rodar (Node >= 22.6 / ideal 24):
//   node --env-file=.env.local scripts/test-inbound-local.mjs
//
// O --env-file carrega SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e
// N8N_WEBHOOK_SECRET ANTES do handler ser importado — o client do Supabase é
// criado no topo do módulo, então as envs precisam já estar presentes.
//
// ATENÇÃO: os testes (b) e (c) chamam o handler por inteiro, o que INSERE uma
// linha real na tabela `messages` do Supabase (service_role bypassa RLS).
// É um teste de integração de verdade, não um dry-run.

import handler from "../api/messages/inbound.ts";

// >>> PREENCHA AQUI antes de rodar o teste (b): um telefone real de paciente <<<
const PHONE_REAL_PACIENTE = "COLOQUE_TELEFONE_AQUI";

const SECRET = process.env.N8N_WEBHOOK_SECRET;

// Um req falso mínimo, no formato que o handler espera.
function makeReq({ secret, body }) {
  return {
    method: "POST",
    headers: { "x-webhook-secret": secret },
    body,
  };
}

// Um res falso: .status(code) é chainable e .json(obj) imprime status + corpo.
function makeRes() {
  let statusCode = 200;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(obj) {
      console.log(`  status: ${statusCode}`);
      console.log(`  body:   ${JSON.stringify(obj)}`);
      return this;
    },
  };
}

async function run(label, { secret, body }) {
  console.log(`\n=== ${label} ===`);
  const req = makeReq({ secret, body });
  const res = makeRes();
  try {
    await handler(req, res);
  } catch (err) {
    console.log(`  ERRO (exceção lançada): ${err?.message ?? err}`);
  }
}

async function main() {
  if (!SECRET) {
    console.error(
      "N8N_WEBHOOK_SECRET não está no ambiente. Use --env-file=.env.local (e confira se a var está lá).",
    );
    process.exit(1);
  }

  // (a) secret errado -> espera 401
  await run("(a) secret ERRADO -> espera 401", {
    secret: "secret-errado-de-proposito",
    body: {
      phone: "5599999999999",
      content: "teste (a) - nao deve passar da autenticacao",
      direction: "inbound",
    },
  });

  // (b) secret certo + telefone real de paciente -> espera 200 com isPatient: true
  if (PHONE_REAL_PACIENTE === "COLOQUE_TELEFONE_AQUI") {
    console.log(
      "\n=== (b) PULADO: edite PHONE_REAL_PACIENTE no script com um telefone real antes de rodar ===",
    );
  } else {
    await run("(b) secret CERTO + telefone de paciente -> espera 200 isPatient:true", {
      secret: SECRET,
      body: {
        phone: PHONE_REAL_PACIENTE,
        content: "teste (b) - mensagem de paciente cadastrado",
        direction: "inbound",
      },
    });
  }

  // (c) secret certo + telefone inexistente -> espera 200 com isPatient: false
  await run("(c) secret CERTO + telefone inexistente -> espera 200 isPatient:false", {
    secret: SECRET,
    body: {
      phone: "5599999999999",
      content: "teste (c) - telefone que nao existe como paciente",
      direction: "inbound",
    },
  });

  console.log("\nFim.");
}

main();
