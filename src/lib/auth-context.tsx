import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi, getToken, setToken } from "@/services/api";
import type { User } from "@/types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const t = getToken();
    if (!t) { setLoading(false); return; }
    authApi.me()
      .then((u) => { if (!cancelled) setUser(u); })
      .catch(() => setToken(null))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const login = async (email: string, password: string) => {
    const r = await authApi.login(email, password);
    setUser(r.user);
  };
  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
