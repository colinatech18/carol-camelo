import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Plus, Pencil, Copy, Archive, Trash2, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  loadForms, deleteForm, duplicateForm, upsertForm,
  type FormDef, type FormStatus,
} from "@/lib/forms-store";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";


export const Route = createFileRoute("/_app/formularios/")({ component: FormsList });

const STATUS: Record<FormStatus, { label: string; cls: string }> = {
  active: { label: "Ativo", cls: "bg-success/15 text-success-foreground border-success/30" },
  draft: { label: "Rascunho", cls: "bg-warning/15 text-warning-foreground border-warning/30" },
  archived: { label: "Arquivado", cls: "bg-muted text-muted-foreground border-border" },
};

function FormsList() {
  const navigate = useNavigate();
  const [forms, setForms] = useState<FormDef[]>(() => (typeof window !== "undefined" ? loadForms() : []));
  const refresh = () => setForms(loadForms());

  const onNew = () => {
    navigate({ to: "/formularios/$id/edit", params: { id: "new" } });
  };


  const onArchive = (f: FormDef) => {
    upsertForm({ ...f, status: f.status === "archived" ? "draft" : "archived" });
    refresh();
    toast.success(f.status === "archived" ? "Formulário restaurado" : "Formulário arquivado");
  };

  const onDuplicate = (f: FormDef) => {
    duplicateForm(f.id);
    refresh();
    toast.success("Formulário duplicado");
  };

  const onDelete = (f: FormDef) => {
    if (!confirm(`Excluir o formulário "${f.name}"?`)) return;
    deleteForm(f.id);
    refresh();
    toast.success("Formulário excluído");
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Formulários</h1>
          <p className="text-sm text-muted-foreground">Crie, edite e gerencie os formulários da clínica.</p>
        </div>
        <Button onClick={onNew}><Plus className="h-4 w-4 mr-2" /> Novo formulário</Button>
      </div>

      {forms.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Nenhum formulário ainda. Clique em "Novo formulário".</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {forms.map((f) => (
            <Card key={f.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base truncate">{f.name}</CardTitle>
                  </div>
                  <Badge variant="outline" className={STATUS[f.status].cls}>{STATUS[f.status].label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3">
                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                  {f.description || <span className="italic">Sem descrição</span>}
                </p>
                <div className="text-xs text-muted-foreground flex items-center justify-between">
                  <span>{f.fields.length} {f.fields.length === 1 ? "pergunta" : "perguntas"}</span>
                  <span>Criado {format(parseISO(f.createdAt), "dd MMM yyyy", { locale: ptBR })}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-2 mt-auto border-t -mx-6 px-6 pt-3">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/formularios/$id/edit" params={{ id: f.id }}><Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar</Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDuplicate(f)}><Copy className="h-3.5 w-3.5 mr-1.5" /> Duplicar</Button>
                  <Button size="sm" variant="ghost" onClick={() => onArchive(f)}><Archive className="h-3.5 w-3.5 mr-1.5" /> {f.status === "archived" ? "Restaurar" : "Arquivar"}</Button>
                  <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => onDelete(f)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
