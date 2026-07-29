import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEnrichedPatients } from "@/hooks/useEnrichedPatients";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_app/prontuarios")({ component: RecordsHub });

function RecordsHub() {
  // Pacientes vêm do Supabase (mesmo hook da tela de Pacientes), NÃO do mock em
  // localStorage — senão a lista mostra pacientes-demo que não existem no banco.
  const { data: patients = [], isLoading } = useEnrichedPatients();

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Prontuários</h1>
        <p className="text-sm text-muted-foreground">Acesse anotações clínicas por paciente.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pacientes</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {isLoading && <p className="text-sm text-muted-foreground py-3">Carregando…</p>}
          {!isLoading && patients.length === 0 && (
            <p className="text-sm text-muted-foreground py-3">Nenhum paciente cadastrado.</p>
          )}
          {patients.map((p) => (
            <Link
              key={p.id}
              to="/prontuario/$id"
              params={{ id: p.id }}
              className="flex items-center justify-between py-3 hover:bg-muted/40 -mx-3 px-3 rounded-md transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.startDate
                      ? `Início ${format(parseISO(p.startDate), "dd MMM yyyy", { locale: ptBR })}`
                      : "Sem data de início"}
                  </div>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">Ver prontuário →</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
