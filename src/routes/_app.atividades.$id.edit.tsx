import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Send, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getAuthHeader } from "@/lib/authHeader";
import { FormFieldsEditor } from "@/components/FormFieldsEditor";
import {
  getActivity,
  saveActivity,
  type ActivityDef,
  type ActivityStatus,
} from "@/lib/activities-store";

const NO_TEMPLATE_SENTINEL = "__none__";

function ActivityEditor() {
  const { id } = getRouteApi("/_app/atividades/$id/edit").useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activity, setActivity] = useState<ActivityDef | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["activities", id],
    queryFn: () => getActivity(id),
    retry: false,
  });

  useEffect(() => {
    if (data) setActivity(data);
  }, [data]);

  useEffect(() => {
    if (!isLoading && data === undefined) {
      toast.error("Atividade não encontrada");
      navigate({ to: "/atividades" });
    }
  }, [isLoading, data, navigate]);

  const { data: patients = [] } = useQuery({
    queryKey: ["patients", "for-activity-target"],
    queryFn: async () => {
      const { data, error } = (await supabase
        .from("patients")
        .select("id, name")
        .is("archived_at", null)
        .order("name")) as any;
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });

  // Templates da Meta cadastrados em Configurações → Integrações. Cada
  // atividade escolhe o seu — não existe um "template padrão" compartilhado
  // com o lembrete do diário (texto de template aprovado é fixo).
  const { data: whatsappTemplates = [] } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: async () => {
      const { data, error } = (await supabase
        .from("whatsapp_templates")
        .select("id, name, language")
        .order("created_at")) as any;
      if (error) throw error;
      return data as Array<{ id: string; name: string; language: string }>;
    },
  });

  const save = useMutation({
    mutationFn: (a: ActivityDef) => saveActivity(a),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Atividade salva");
      navigate({ to: "/atividades" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const dispatchNow = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/activities/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ activityId: id }),
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

  if (isLoading || !activity) return <div className="p-8 text-muted-foreground">Carregando…</div>;

  const update = (patch: Partial<ActivityDef>) => setActivity({ ...activity, ...patch });
  const cancel = () => navigate({ to: "/atividades" });

  const toggleTargetPatient = (patientId: string, checked: boolean) => {
    const next = checked
      ? [...activity.targetPatientIds, patientId]
      : activity.targetPatientIds.filter((p) => p !== patientId);
    update({ targetPatientIds: next });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <Link
        to="/atividades"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Atividades
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-[260px] space-y-2">
          <Input
            value={activity.name}
            onChange={(e) => update({ name: e.target.value })}
            className="text-xl font-semibold h-auto py-2 px-3"
            placeholder="Nome da atividade"
          />
          <Textarea
            value={activity.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Descrição curta"
            className="min-h-[44px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={activity.status}
            onValueChange={(v: ActivityStatus) => update({ status: v })}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativa</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="archived">Arquivada</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => dispatchNow.mutate()}
            disabled={activity.status !== "active" || dispatchNow.isPending}
            title={
              activity.status !== "active"
                ? "Só é possível enviar atividades ativas"
                : "Enviar agora"
            }
          >
            {dispatchNow.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar agora
          </Button>
          <Button variant="outline" onClick={cancel}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate(activity)} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Envio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem enviada por WhatsApp</Label>
            <Textarea
              rows={3}
              value={activity.messageTemplate}
              onChange={(e) => update({ messageTemplate: e.target.value })}
              placeholder="Olá {{name}}! Você tem uma nova atividade disponível: {{link}}"
            />
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: <code>{"{{name}}"}</code> (primeiro nome do paciente),{" "}
              <code>{"{{link}}"}</code> (link da atividade). Usado quando o paciente mandou mensagem
              nas últimas 24h — fora dessa janela, entra o template da Meta escolhido abaixo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Template da Meta (fora da janela de 24h)</Label>
            <Select
              value={activity.whatsappTemplateId ?? NO_TEMPLATE_SENTINEL}
              onValueChange={(v) =>
                update({ whatsappTemplateId: v === NO_TEMPLATE_SENTINEL ? null : v })
              }
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Nenhum template selecionado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE_SENTINEL}>Nenhum (não cadastrado ainda)</SelectItem>
                {whatsappTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.language})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {whatsappTemplates.length === 0
                ? 'Nenhum template cadastrado ainda — crie um em Configurações → Integrações → "Templates de WhatsApp" com o texto da atividade aprovado na Meta.'
                : 'Sem template escolhido, pacientes fora da janela de 24h não recebem (ficam marcados como "sem template" no resultado do envio).'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Quem recebe</Label>
            <Select
              value={activity.targetMode}
              onValueChange={(v: "all_active" | "selected") => update({ targetMode: v })}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_active">Todos os pacientes ativos</SelectItem>
                <SelectItem value="selected">Pacientes selecionados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {activity.targetMode === "selected" && (
            <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
              {patients.length === 0 && (
                <p className="text-sm text-muted-foreground p-3">Nenhum paciente cadastrado.</p>
              )}
              {patients.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 p-2.5 text-sm cursor-pointer hover:bg-muted/40"
                >
                  <Checkbox
                    checked={activity.targetPatientIds.includes(p.id)}
                    onCheckedChange={(v) => toggleTargetPatient(p.id, Boolean(v))}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FormFieldsEditor fields={activity.fields} onChange={(fields) => update({ fields })} />
    </div>
  );
}

export const Route = createFileRoute("/_app/atividades/$id/edit")({ component: ActivityEditor });
