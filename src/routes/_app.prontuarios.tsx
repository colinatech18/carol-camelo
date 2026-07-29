import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CriticalityBadge } from "@/components/CriticalityBadge";
import { useEnrichedPatients } from "@/hooks/useEnrichedPatients";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/prontuarios")({ component: RecordsHub });

const AVATAR_PALETTE = [
  "bg-blue-500/20 text-blue-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-amber-500/20 text-amber-300",
  "bg-rose-500/20 text-rose-300",
  "bg-violet-500/20 text-violet-300",
  "bg-cyan-500/20 text-cyan-300",
];
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
function avatarColor(name: string) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
}

function RecordsHub() {
  // Pacientes vêm do Supabase (mesmo hook da tela de Pacientes), NÃO do mock em
  // localStorage — senão a lista mostra pacientes-demo que não existem no banco.
  const { data: patients = [], isLoading } = useEnrichedPatients();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.toLowerCase();
    return patients.filter(
      (p) => p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term),
    );
  }, [patients, q]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prontuários</h1>
          <p className="text-sm text-muted-foreground">
            Selecione um paciente para ver e registrar anotações clínicas.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 w-56"
            placeholder="Buscar paciente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-6">Carregando…</p>
          ) : (
            <>
              <div className="divide-y">
                {filtered.map((p) => (
                  <Link
                    key={p.id}
                    to="/prontuario/$id"
                    params={{ id: p.id }}
                    className="flex items-center gap-3 p-4 hover:bg-muted/40 transition"
                  >
                    <div className={cn("h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold", avatarColor(p.name))}>
                      {initials(p.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.startDate
                          ? `Início ${format(parseISO(p.startDate), "dd MMM yyyy", { locale: ptBR })}`
                          : "Sem data de início"}
                      </div>
                    </div>
                    <span className="hidden sm:block text-xs text-muted-foreground shrink-0">
                      Dia {p.programDay}/30
                    </span>
                    <CriticalityBadge level={p.criticality} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground p-6 text-center">
                    Nenhum paciente encontrado.
                  </p>
                )}
              </div>
              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                {filtered.length} paciente(s)
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
