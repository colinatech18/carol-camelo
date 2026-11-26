import { createHash, timingSafeEqual } from "node:crypto";

// Comparação de tempo constante. Hasheia ambos para um buffer de tamanho fixo
// antes de comparar: garante que timingSafeEqual não lance (exige mesmo tamanho)
// e não vaza o comprimento do segredo.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
