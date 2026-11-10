import { createContext, useContext, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useProfileLoader } from "@/lib/useProfileLoader";
import type { User } from "@/types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, loading, load: loadProfile, clear } = useProfileLoader();

  useEffect(() => {
    // IMPORTANTE: este callback NÃO pode fazer await em outra chamada do Supabase
    // (como buscar o perfil). A biblioteca segura uma trava interna enquanto roda
    // o callback, e qualquer consulta ao banco precisa dessa mesma trava: as duas
    // ficam esperando uma à outra (deadlock) até estourar o tempo limite — foi
    // isso que deixava a abertura do app com sessão guardada levando mais de 1
    // minuto. Por isso a busca do perfil é adiada pra fora do callback.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        clear();
        return;
      }
      const id = session.user.id;
      setTimeout(() => {
        void loadProfile(id);
      }, 0);
    });

    // Garante o estado inicial mesmo que nenhum evento chegue.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) void loadProfile(session.user.id);
      else clear();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadProfile, clear]);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    // Espera o perfil carregar antes de o login terminar, pra que a navegação
    // seguinte já encontre o usuário preenchido (e não seja barrada).
    if (data.user) await loadProfile(data.user.id);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    clear();
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}