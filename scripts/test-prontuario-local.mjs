// Testa a imutabilidade de prontuario_notes via RLS, usando o client ANON
// autenticado como staff comum (NUNCA service_role), sem vercel dev.
//
// Rodar:
//   node --env-file=.env.local scripts/test-prontuario-local.mjs
//
// Precisa no .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// TEST_STAFF_EMAIL, TEST_STAFF_PASSWORD (credenciais de um usuário do Supabase Auth).
//
// Preencha PATIENT_ID abaixo com um paciente real antes de rodar os testes (2)–(5);
// com o placeholder, o script faz só o login e pula (2)–(5).
//
// ATENÇÃO: o passo (2) grava uma linha real e PERMANENTE em prontuario_notes
// (o paciente do PATIENT_ID). Como staff não pode dar DELETE (é o que testamos), a
// limpeza só é possível depois via SQL Editor / service_role.
//
// Obs.: evitamos process.exit() de propósito — encerrar à força enquanto o client
// Supabase tem um handle aberto quebra o libuv no Windows. Usamos process.exitCode
// e deixamos o processo terminar naturalmente.

import { createClient } from "@supabase/supabase-js";

// Preencha com o id de um paciente real antes de rodar os testes (2)–(5).
const PLACEHOLDER = "COLOQUE_PATIENT_ID_AQUI";
const PATIENT_ID = PLACEHOLDER;

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, TEST_STAFF_EMAIL, TEST_STAFF_PASSWORD } =
  process.env;

let pass = 0;
let fail = 0;
function mark(ok, label) {
  console.log(`  => ${ok ? "PASS ✓" : "FAIL ✗"} ${label}`);
  if (ok) pass++;
  else fail++;
}

async function main() {
  for (const [k, v] of Object.entries({
    VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY,
    TEST_STAFF_EMAIL,
    TEST_STAFF_PASSWORD,
  })) {
    if (!v) {
      console.error(`${k} ausente. Rode: node --env-file=.env.local scripts/test-prontuario-local.mjs`);
      process.exitCode = 1;
      return;
    }
  }

  // Client ANON (nunca service_role). Sem persistência de sessão (ambiente Node).
  const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) LOGIN como staff comum
  console.log("=== (1) login (signInWithPassword) ===");
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: TEST_STAFF_EMAIL,
    password: TEST_STAFF_PASSWORD,
  });
  if (authErr || !authData?.user) {
    console.error("  login falhou:", authErr?.message ?? "sem user");
    process.exitCode = 1;
    return;
  }
  const uid = authData.user.id;
  console.log("  login OK — user.id (auth.uid) =", uid);

  // Guarda: sem um paciente real, pula os testes (2)–(5) que dependem do patient_id.
  if (PATIENT_ID === PLACEHOLDER) {
    console.log(
      "\n⚠️  PATIENT_ID é placeholder — pulando os testes (2)–(5) (dependem de um paciente real).",
    );
    console.log("   Preencha PATIENT_ID no script com o id de um paciente real para rodá-los.");
    return;
  }

  // 2) INSERT legítimo (author_id = uid) -> deve funcionar
  console.log("\n=== (2) INSERT anotação de teste (author_id = próprio user) ===");
  const { data: inserted, error: insErr } = await supabase
    .from("prontuario_notes")
    .insert({
      patient_id: PATIENT_ID,
      author_id: uid,
      note_type: "psicologica",
      content: "TESTE - PODE APAGAR",
    })
    .select("id, content")
    .single();
  if (insErr || !inserted) {
    console.error("  INSERT falhou:", insErr?.message ?? "sem retorno");
    console.error("  (a migration 0002 foi aplicada? a policy exige author_id = auth.uid())");
    process.exitCode = 1;
    return;
  }
  const rowId = inserted.id;
  console.log("  inserido id =", rowId, "| content =", JSON.stringify(inserted.content));

  // 3) UPDATE -> deve ser bloqueado (sem policy de update). Prova: content permanece.
  console.log("\n=== (3) UPDATE (espera bloqueio) ===");
  const { data: updData, error: updErr } = await supabase
    .from("prontuario_notes")
    .update({ content: "tentativa de alteração" })
    .eq("id", rowId)
    .select("id, content");
  console.log(
    "  resposta do update: data =",
    JSON.stringify(updData),
    "| error =",
    updErr ? `${updErr.code ?? ""} ${updErr.message}` : "null",
  );
  const { data: afterUpd } = await supabase
    .from("prontuario_notes")
    .select("content")
    .eq("id", rowId)
    .single();
  console.log("  releitura content =", JSON.stringify(afterUpd?.content));
  mark(afterUpd?.content === "TESTE - PODE APAGAR", "UPDATE bloqueado (content inalterado)");

  // 4) DELETE -> deve ser bloqueado (sem policy de delete). Prova: linha permanece.
  console.log("\n=== (4) DELETE (espera bloqueio) ===");
  const { data: delData, error: delErr } = await supabase
    .from("prontuario_notes")
    .delete()
    .eq("id", rowId)
    .select("id");
  console.log(
    "  resposta do delete: data =",
    JSON.stringify(delData),
    "| error =",
    delErr ? `${delErr.code ?? ""} ${delErr.message}` : "null",
  );
  const { data: afterDel } = await supabase
    .from("prontuario_notes")
    .select("id")
    .eq("id", rowId)
    .maybeSingle();
  console.log("  releitura: linha ainda existe? =", !!afterDel);
  mark(!!afterDel, "DELETE bloqueado (linha ainda existe)");

  // 5) INSERT forjando autoria (author_id != uid) -> deve ser rejeitado pela policy.
  // Usa o id de OUTRO profile real quando existir (FK passa; só a RLS with-check barra,
  // prova limpa). Se só houver um usuário, cai num uuid aleatório (aí a FK também barra).
  console.log("\n=== (5) INSERT forjando autoria (espera rejeição) ===");
  const { data: others } = await supabase.from("profiles").select("id").neq("id", uid).limit(1);
  const otherAuthor = others?.[0]?.id ?? "11111111-1111-1111-1111-111111111111";
  const usedRealOther = !!others?.[0]?.id;
  console.log(
    `  author_id forjado = ${otherAuthor} (${usedRealOther ? "id real de outro staff" : "uuid aleatório — FK também pode barrar"})`,
  );
  const { data: forged, error: forgeErr } = await supabase
    .from("prontuario_notes")
    .insert({
      patient_id: PATIENT_ID,
      author_id: otherAuthor,
      note_type: "psicologica",
      content: "TESTE - forjar autoria",
    })
    .select("id");
  console.log(
    "  resposta: data =",
    JSON.stringify(forged),
    "| error =",
    forgeErr ? `${forgeErr.code ?? ""} ${forgeErr.message}` : "null",
  );
  const rejected = !!forgeErr || !forged || forged.length === 0;
  mark(rejected, "INSERT forjado rejeitado");
  if (!rejected && forged?.[0]?.id) {
    console.log("  !! ATENÇÃO: forjado NÃO foi bloqueado — linha extra criada, id =", forged[0].id);
  }

  console.log(`\nResumo: ${pass} PASS / ${fail} FAIL`);
  console.log(
    "Limpeza: apague a(s) linha(s) de teste em prontuario_notes via SQL Editor (service_role):",
  );
  console.log("  delete from public.prontuario_notes where content like 'TESTE -%';");
  if (fail > 0) process.exitCode = 1;
}

await main();
