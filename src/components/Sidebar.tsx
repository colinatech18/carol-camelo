import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, ClipboardList, FileText, Settings, LogOut, Brain } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/formularios", label: "Formulários", icon: ClipboardList },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const roleLabel = user?.role === "admin" ? "Administrador" : user?.role === "psychiatrist" ? "Psiquiatra" : "Psicólogo";

  return (
    <aside className="hidden md:flex sticky top-0 h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="shrink-0 flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Brain className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Vera PSI</div>
          <div className="text-xs text-muted-foreground">Acompanhamento clínico</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">

        {items.map((it) => {
          const active = path.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3 space-y-2">
        <div className="px-2 py-1">
          <div className="text-sm font-medium truncate">{user?.name}</div>
          <div className="text-xs text-muted-foreground">{roleLabel}</div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={async () => { await logout(); navigate({ to: "/login" }); }}>
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </Button>
      </div>
    </aside>
  );
}
