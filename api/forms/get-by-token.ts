import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
// Reaproveita a MESMA lógica de dia do programa usada em toda a app (não reescrever).
// `programDay` é uma função pura (date-fns); o `import type "@/types"` dentro dela é
// apagado pelo esbuild no build da Vercel, então a importação relativa é segura.
import { programDay } from "../../src/lib/criticality";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const raw = req.query.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token ausente" });
  }

  // Só as colunas necessárias. NUNCA selecionar CPF, diagnóstico, medicações,
  // contato de emergência etc. — este endpoint é público (só protegido pelo token).
  const { data, error } = await supabaseAdmin
    .from("patients")
    .select("id, name, program_start_date")
    .eq("public_token", token)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "not_found" });

  // Retorna SÓ o mínimo. `program_start_date` cru fica no servidor; expomos apenas
  // o dia do programa já calculado.
  return res.status(200).json({
    patientId: data.id,
    name: data.name,
    programDay: programDay(data.program_start_date),
  });
}
