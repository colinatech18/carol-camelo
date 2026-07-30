import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/redefinir-senha")({ component: ResetPasswordPage });

function ResetPasswordPage() {
  const navigate = useNavigate();
  // null = validando; true = sessão de recuperação ativa; false = sem sessão (link inválido).
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // O link de recuperação traz um token no hash da URL; o client do Supabase o processa
    // e estabelece uma sessão. Consideramos "pronto" quando houver sessão.
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Senha redefinida. Faça login com a nova senha.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao redefinir senha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <span className="text-lg font-semibold">Vera PSI</span>
        </div>

        {ready === null ? (
          <p className="text-sm text-muted-foreground">Validando link…</p>
        ) : ready ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">Nova senha</h2>
              <p className="text-sm text-muted-foreground">Defina uma nova senha para sua conta.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Redefinir senha
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Link inválido ou expirado</h2>
            <p className="text-sm text-muted-foreground">
              Peça um novo link de redefinição de senha à sua equipe.
            </p>
            <Button variant="outline" onClick={() => navigate({ to: "/login" })}>
              Ir para o login
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
