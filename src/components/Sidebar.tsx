import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, ClipboardList, Settings, LogOut, Brain, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  psicologo: "Psicólogo",
  psiquiatra: "Psiquiatra",
  recepcionista: "Recepcionista",
};

const allItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "psicologo", "psiquiatra", "recepcionista"] },
  { to: "/pacientes", label: "Pacientes", icon: Users, roles: ["admin", "psicologo", "psiquiatra", "recepcionista"] },
  { to: "/formularios", label: "Formulários", icon: ClipboardList, roles: ["admin", "psicologo"] },
  { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin", "psicologo", "psiquiatra", "recepcionista"] },
];

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const roleLabel = ROLE_LABEL[user?.role ?? ""] ?? "Usuário";
  const items = allItems.filter((it) => it.roles.includes(user?.role ?? ""));
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={cn(
      "hidden md:flex sticky top-0 h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-5 border-b border-sidebar-border relative">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Brain className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="leading-tight overflow-hidden">
            <div className="text-sm font-semibold">Vera PSI</div>
            <div className="text-xs text-muted-foreground">Acompanhamento clínico</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-6 h-6 w-6 rounded-full border border-sidebar-border bg-sidebar flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {items.map((it) => {
          const active = path.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              title={collapsed ? it.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center" : "",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && it.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-sidebar-border p-2 space-y-2">
        {!collapsed && (
          <div className="px-2 py-1">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-xs text-muted-foreground">{roleLabel}</div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          title={collapsed ? "Sair" : undefined}
          className={cn("w-full", collapsed ? "justify-center px-0" : "justify-start")}
          onClick={async () => { await logout(); navigate({ to: "/login" }); }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </div>
    </aside>
  );
}
