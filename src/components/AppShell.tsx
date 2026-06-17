import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { initAppearance } from "@/lib/appearance";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => { initAppearance(); }, []);

  useEffect(() => {
    if (loading || user) return;
    const target = pathname && !pathname.startsWith("/login") ? pathname : "/dashboard";
    navigate({ to: "/login", search: { redirect: target } });
  }, [loading, user, navigate, pathname]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
