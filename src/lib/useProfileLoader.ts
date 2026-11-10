import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@/types";

async function fetchProfile(id: string): Promise<User | null> {
  const { data, error } = (await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single()) as any;
  if (error) {
    // PGRST116 = nenhuma linha encontrada: o perfil realmente não existe (ex.:
    // conta removida). Qualquer outro erro é falha transitória (rede, timeout)
    // e precisa ser tratada diferente — não é "sem perfil".
    if (error.code === "PGRST116") return null;
    throw error;
  }
  if (!data) return null;
  return { id: data.id, name: data.name, email: data.email, role: data.role };
}

/**
 * Estado de sessão + perfil do usuário logado, isolado do resto de
 * `AuthProvider` porque é a parte mais frágil: dedup de busca em voo,
 * guard contra `setUser` de uma busca obsoleta (logout/troca de conta no
 * meio do caminho) e distinção entre "sem perfil" e "falha de rede".
 * Qualquer mudança aqui (ex.: recarregar o perfil quando a role mudar) corre
 * risco de reabrir essas corridas — mantenha a lógica isolada e testável.
 */
export function useProfileLoader() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  // Busca de perfil em andamento (ou já concluída) por usuário — evita buscar o
  // perfil de novo a cada evento da mesma sessão (renovação de token, foco da aba).
  const inflight = useRef<{ id: string; promise: Promise<void> } | null>(null);
  // Incrementado a cada logout/nova busca de perfil. Uma busca em voo só pode
  // aplicar `setUser` se ainda for a mais recente — evita que o resultado de um
  // `load` antigo (ex.: do usuário anterior, antes de um logout ou troca
  // rápida de conta) "ressuscite" um perfil depois que outro já assumiu.
  const callSeq = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback((id: string): Promise<void> => {
    if (inflight.current?.id === id) return inflight.current.promise;
    const seq = ++callSeq.current;

    const promise = (async () => {
      let profile: User | null = null;
      let transientError = false;
      try {
        profile = await fetchProfile(id);
      } catch (e) {
        console.error("Erro ao carregar o perfil", e);
        transientError = true;
      }
      // Falhou: libera pra uma próxima tentativa em vez de travar em "sem perfil".
      if (inflight.current?.id === id && (!profile || transientError)) inflight.current = null;
      if (!mounted.current) return;
      if (callSeq.current !== seq) return; // uma chamada mais nova já assumiu
      if (transientError) {
        // Falha transitória (rede, timeout): a sessão continua válida, então
        // não desloga o usuário por causa disso — só libera o loading.
        setLoading(false);
        return;
      }
      setUser(profile);
      setLoading(false);
    })();

    inflight.current = { id, promise };
    return promise;
  }, []);

  const clear = useCallback(() => {
    callSeq.current++; // invalida qualquer load em voo
    inflight.current = null;
    setUser(null);
    setLoading(false);
  }, []);

  return { user, loading, load, clear };
}
