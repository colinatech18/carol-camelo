import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ROLES = ["admin", "psicologo", "psiquiatra", "recepcionista"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = (req.body ?? {}) as { id?: unknown; name?: unknown; role?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!id || !name || !ROLES.includes(role)) {
    return res.status(400).json({ error: "id, name e role (válido) são obrigatórios" });
  }

  // A app lê nome/papel de `profiles`, então esta é a fonte de verdade.
  const { error: pErr } = await supabaseAdmin
    .from("profiles")
    .update({ name, role })
    .eq("id", id);
  if (pErr) return res.status(400).json({ error: pErr.message });

  // Mantém o user_metadata do auth em sincronia (não é lido pela app, mas evita divergência).
  await supabaseAdmin.auth.admin.updateUserById(id, { user_metadata: { name, role } });

  return res.status(200).json({ ok: true });
}
