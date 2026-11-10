import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getForm, saveForm, type FormDef, type FormStatus } from "@/lib/forms-store";
import { FormFieldsEditor } from "@/components/FormFieldsEditor";

function FormEditor() {
  const { id } = getRouteApi("/_app/formularios/$id/edit").useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormDef | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["forms", id],
    queryFn: () => getForm(id),
    retry: false,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  useEffect(() => {
    if (!isLoading && (isError || (data === undefined && !isLoading))) {
      // getForm resolve undefined quando o formulário não existe (id inválido/apagado).
      if (data === undefined) {
        toast.error("Formulário não encontrado");
        navigate({ to: "/formularios" });
      }
    }
  }, [isLoading, isError, data, navigate]);

  const save = useMutation({
    mutationFn: (f: FormDef) => saveForm(f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms"] });
      toast.success("Formulário salvo");
      navigate({ to: "/formularios" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  if (isLoading || !form) return <div className="p-8 text-muted-foreground">Carregando…</div>;

  const update = (patch: Partial<FormDef>) => setForm({ ...form, ...patch });

  const cancel = () => navigate({ to: "/formularios" });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <Link
        to="/formularios"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Formulários
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-[260px] space-y-2">
          <Input
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            className="text-xl font-semibold h-auto py-2 px-3"
            placeholder="Nome do formulário"
          />
          <Textarea
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Descrição curta"
            className="min-h-[44px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={form.status} onValueChange={(v: FormStatus) => update({ status: v })}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="archived">Arquivado</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={cancel}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </div>

      <FormFieldsEditor fields={form.fields} onChange={(fields) => update({ fields })} />
    </div>
  );
}

export const Route = createFileRoute("/_app/formularios/$id/edit")({ component: FormEditor });
