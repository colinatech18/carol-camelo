import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  ListChecks,
  Send,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  listActivities,
  createActivity,
  duplicateActivity,
  deleteActivity,
  saveActivity,
  type ActivityDef,
  type ActivityStatus,
} from "@/lib/activities-store";
import { getAuthHeader } from "@/lib/authHeader";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/atividades/")({ component: ActivitiesList });

const STATUS_LABEL: Record<ActivityStatus, string> = {
  active: "Ativa",
  draft: "Rascunho",
  archived: "Arquivada",
};
const STATUS_BADGE: Record<ActivityStatus, string> = {
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  draft: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  archived: "bg-muted text-muted-foreground border-border",
};
function ActivitiesList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: listActivities,
  });

  const create = useMutation({
    mutationFn: createActivity,
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      navigate({ to: "/atividades/$id/edit", params: { id: a.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar atividade"),
  });

  const duplicate = useMutation({
    mutationFn: duplicateActivity,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Atividade duplicada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao duplicar"),
  });

  const remove = useMutation({
    mutationFn: deleteActivity,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Atividade excluída");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  const toggleArchive = useMutation({
    mutationFn: (a: ActivityDef) =>
      saveActivity({ ...a, status: a.status === "archived" ? "draft" : "archived" }),
    onSuccess: (_data, a) => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success(a.status === "archived" ? "Atividade restaurada" : "Atividade arquivada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  const dispatchNow = useMutation({
    mutationFn: async (activityId: string) => {
      const res = await fetch("/api/activities/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ activityId }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Erro ao disparar");
      return result as { sent: number; skipped: Array<{ patientId: string; reason: string }> };
    },
    onSuccess: (result) => {
      toast.success(
        result.sent > 0
          ? `Enviado para ${result.sent} paciente(s)`
          : "Nenhum paciente elegível para envio",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao disparar"),
  });

  const filtered = activities.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Atividades</h1>
          <p className="text-sm text-muted-foreground">
            Tarefas/questionários enviados manualmente aos pacientes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 w-56"
              placeholder="Buscar atividade…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="h-4 w-4 mr-2" /> Nova atividade
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma atividade encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Link
                      to="/atividades/$id/edit"
                      params={{ id: a.id }}
                      className="text-sm font-medium truncate hover:underline"
                    >
                      {a.name}
                    </Link>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0", STATUS_BADGE[a.status])}>
                    {STATUS_LABEL[a.status]}
                  </Badge>
                </div>
                {a.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{a.fields.length} pergunta(s)</span>
                  <span>·</span>
                  <span>
                    {a.targetMode === "all_active"
                      ? "Todos os pacientes ativos"
                      : `${a.targetPatientIds.length} paciente(s)`}
                  </span>
                </div>
                <div className="flex items-center gap-1 pt-1">
                  <Button size="icon" variant="ghost" title="Editar" asChild>
                    <Link to="/atividades/$id/edit" params={{ id: a.id }}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Enviar agora"
                    disabled={a.status !== "active" || dispatchNow.isPending}
                    onClick={() => dispatchNow.mutate(a.id)}
                  >
                    {dispatchNow.isPending && dispatchNow.variables === a.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Duplicar"
                    onClick={() => duplicate.mutate(a.id)}
                    disabled={duplicate.isPending}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title={a.status === "archived" ? "Restaurar" : "Arquivar"}
                    onClick={() => toggleArchive.mutate(a)}
                    disabled={toggleArchive.isPending}
                  >
                    {a.status === "archived" ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" title="Excluir">
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir &quot;{a.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Só é possível excluir atividades sem respostas ou envios registrados. Ação
                          irreversível.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(a.id)}>
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
