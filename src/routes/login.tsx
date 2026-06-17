import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USE_MOCK } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: (s.redirect as string) || "/dashboard" }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const [email, setEmail] = useState("admin@clinica.com");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      navigate({ to: search.redirect });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary to-accent-foreground text-primary-foreground">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Brain className="h-6 w-6" />
          </div>
          <span className="text-lg font-semibold">Vera PSI</span>
        </div>
        <div className="space-y-3 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">Acompanhamento clínico que cabe no dia a dia da equipe.</h1>
          <p className="text-primary-foreground/80">30 dias de programa, evolução diária, prontuário compartilhado e alertas de criticidade em um só lugar.</p>
        </div>
        <p className="text-xs text-primary-foreground/60">© Vera PSI · Uso interno</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Entrar</h2>
            <p className="text-sm text-muted-foreground">Acesse com seu e-mail e senha da equipe.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Entrar
          </Button>

          {USE_MOCK && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-foreground">Modo demonstração</div>
              <div>Defina <code>VITE_API_URL</code> para apontar para sua API. Contas de teste:</div>
              <ul className="space-y-0.5 mt-1">
                <li>· admin@clinica.com / admin123</li>
                <li>· psicologo@clinica.com / senha123</li>
                <li>· psiquiatra@clinica.com / senha123</li>
              </ul>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
