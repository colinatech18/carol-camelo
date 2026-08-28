import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Copy, Archive, ArchiveRestore, Trash2, FileText } from "lucide-react";
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
import { listForms, createForm, duplicateForm, deleteForm, saveForm, type FormDef, type FormStatus } from "@/lib/forms-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/formularios/")({ component: FormsList });

const STATUS_LABEL: Record<FormStatus, string> = { active: "Ativo", draft: "Rascunho", archived: "Arquivado" };
const STATUS_BADGE: Record<FormStatus, string> = {
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  draft: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  archived: "bg-muted text-muted-foreground border-border",
};

function FormsList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const { data: forms = [], isLoading } = useQuery({ queryKey: ["forms"], queryFn: listForms });

  const create = useMutation({
    mutationFn: createForm,
    onSuccess: (form) => {
      qc.invalidateQueries({ queryKey: ["forms"] });
      navigate({ to: "/formularios/$id/edit", params: { id: form.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar formulário"),
  });

  const duplicate = useMutation({
    mutationFn: duplicateForm,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms"] });
      toast.success("Formulário duplicado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao duplicar"),
  });

  const remove = useMutation({
    mutationFn: deleteForm,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms"] });
      toast.success("Formulário excluído");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  // Atalho rápido pra tirar/devolver um formulário de circulação sem abrir o
  // editor. Restaurar sempre volta para "rascunho" (não tenta adivinhar o
  // status anterior) — se quiser reativar de verdade, o admin/psicólogo passa
  // pelo editor e escolhe "Ativo" explicitamente.
  const toggleArchive = useMutation({
    mutationFn: (f: FormDef) =>
      saveForm({ ...f, status: f.status === "archived" ? "draft" : "archived" }),
    onSuccess: (_data, f) => {
      qc.invalidateQueries({ queryKey: ["forms"] });
      toast.success(f.status === "archived" ? "Formulário restaurado" : "Formulário arquivado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  const filtered = forms.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Formulários</h1>
          <p className="text-sm text-muted-foreground">Formulários enviados aos pacientes.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 w-56"
              placeholder="Buscar formulário…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="h-4 w-4 mr-2" /> Novo formulário
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum formulário encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((f) => (
            <Card key={f.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Link
                      to="/formularios/$id/edit"
                      params={{ id: f.id }}
                      className="text-sm font-medium truncate hover:underline"
                    >
                      {f.name}
                    </Link>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0", STATUS_BADGE[f.status])}>
                    {STATUS_LABEL[f.status]}
                  </Badge>
                </div>
                {f.description && <p className="text-xs text-muted-foreground line-clamp-2">{f.description}</p>}
                <p className="text-xs text-muted-foreground">{f.fields.length} pergunta(s)</p>
                <div className="flex items-center gap-1 pt-1">
                  <Button size="icon" variant="ghost" title="Editar" asChild>
                    <Link to="/formularios/$id/edit" params={{ id: f.id }}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Duplicar"
                    onClick={() => duplicate.mutate(f.id)}
                    disabled={duplicate.isPending}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title={f.status === "archived" ? "Restaurar" : "Arquivar"}
                    onClick={() => toggleArchive.mutate(f)}
                    disabled={toggleArchive.isPending}
                  >
                    {f.status === "archived" ? (
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
                        <AlertDialogTitle>Excluir &quot;{f.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Só é possível excluir formulários sem respostas registradas, sem
                          pacientes atribuídos, e que não sejam o formulário padrão do sistema.
                          Ação irreversível.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(f.id)}>Excluir</AlertDialogAction>
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