import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Comparação de tempo constante. Hasheia ambos para um buffer de tamanho fixo
// antes de comparar: garante que timingSafeEqual não lance (exige mesmo tamanho)
// e não vaza o comprimento do segredo.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Normaliza um telefone para comparação: remove tudo que não é dígito e garante o
// DDI 55. Números com 10 ou 11 dígitos (DDD + número, sem código do país) recebem
// "55" na frente — assim "84999998888" e "5584999998888" viram a mesma chave.
// Aplicado dos DOIS lados (recebido e cadastrado).
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

type Direction = "inbound" | "outbound";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    // Falha fechada: sem segredo configurado, ninguém passa.
    return res.status(500).json({ error: "N8N_WEBHOOK_SECRET não configurado" });
  }

  const header = req.headers["x-webhook-secret"];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided || !safeEqual(provided, secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body ?? {}) as {
    phone?: unknown;
    content?: unknown;
    direction?: unknown;
    contentType?: unknown;
  };

  const phoneRaw = typeof body.phone === "string" ? body.phone : "";
  const content = typeof body.content === "string" ? body.content : "";
  const direction = body.direction;
  const contentType =
    typeof body.contentType === "string" && body.contentType.trim() ? body.contentType : "text";

  // Normaliza para a forma canônica (dígitos + DDI 55, ver normalizePhone). O cadastro
  // grava patients.phone como o usuário digitou — sem máscara e, às vezes, sem o 55 —
  // então a comparação é feita sobre a forma canônica, dos dois lados.
  const phone = normalizePhone(phoneRaw);

  if (!phone || !content || (direction !== "inbound" && direction !== "outbound")) {
    return res.status(400).json({
      error:
        "Campos inválidos: phone (precisa conter dígitos), content (string) e direction ('inbound'|'outbound') são obrigatórios",
    });
  }

  // patients.phone não é normalizado no banco, então trazemos os candidatos e
  // comparamos por dígitos aqui. (service_role bypassa RLS.)
  const { data: patientRows, error: lookupError } = await supabaseAdmin
    .from("patients")
    .select("id, phone");

  if (lookupError) {
    return res.status(500).json({ error: lookupError.message });
  }

  const match = ((patientRows ?? []) as Array<{ id: string; phone: string | null }>).find(
    (p) => {
      // Ignora candidatos sem telefone (null/vazio) antes de normalizar e comparar.
      if (typeof p.phone !== "string" || p.phone.trim() === "") return false;
      return normalizePhone(p.phone) === phone;
    },
  );
  const patientId: string | null = match?.id ?? null;

  const { error: insertError } = await supabaseAdmin.from("messages").insert({
    phone, // normalizado (apenas dígitos)
    patient_id: patientId,
    direction: direction as Direction,
    content,
    content_type: contentType,
  });

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  return res.status(200).json({
    ok: true,
    isPatient: patientId !== null,
    ...(patientId ? { patientId } : {}),
  });
}
