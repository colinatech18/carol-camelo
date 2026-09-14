import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Copy, Check, FileText, Pencil, Loader2, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { CriticalityBadge } from "@/components/CriticalityBadge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/authHeader";
import { criticalityFromResponses, programDay, averageOfEntry } from "@/lib/criticality";
import type { FormField } from "@/lib/forms-store";
import { cn } from "@/lib/utils";
import { format, parseISO, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import type { Patient, ResponseEntry } from "@/types";

export const Route = createFileRoute("/_app/pacientes/$id")({ component: PatientDetail });

const STATUS_LABEL = { active: "Ativo", completed: "Concluído", paused: "Pausado" } as const;
const OTHER_SENTINEL = "__other__";

const APPT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  done: "Realizado",
  cancelled: "Cancelado",
};

type EditForm = {
  name: string;
  email: string;
  whatsapp: string;
  startDate: string;
  responsibleId: string;
  status: "active" | "paused" | "completed";
};

/** Traduz o valor bruto salvo (número, id de opção, etc.) para texto legível,
 * usando a definição real do campo do formulário respondido. Sem a definição
 * (campo não encontrado, formulário apagado), cai no valor bruto. */
function formatAnswerValue(field: FormField | undefined, value: unknown): string {
  if (!field) {
    if (Array.isArray(value)) return value.join(", ");
    return value === undefined || value === null ? "—" : String(value);
  }
  switch (field.type) {
    case "emoji_scale": {
      const idx = typeof value === "number" ? value - 1 : -1;
      return field.options?.[idx]?.label ?? String(value);
    }
    case "radio":
    case "dropdown": {
      if (value === OTHER_SENTINEL) return "Outro";
      return field.options?.find((o) => o.id === value)?.label ?? String(value);
    }
    case "checkbox": {
      if (!Array.isArray(value)) return String(value);
      return value
        .map((v) => (v === OTHER_SENTINEL ? "Outro" : field.options?.find((o) => o.id === v)?.label ?? String(v)))
        .join(", ");
    }
    case "date": {
      try {
        return format(parseISO(String(value)), "dd/MM/yyyy");
      } catch {
        return String(value);
      }
    }
    case "money":
      return `${field.currency ?? "BRL"} ${Number(value).toFixed(2)}`;
    case "number":
      return `${value}${field.unit ? ` ${field.unit}` : ""}`;
    default:
      return String(value);
  }
}

function PatientDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: patient } = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => {
      const { data, error } = (await supabase.from("patients").select("*").eq("id", id).single()) as any;
      if (error) throw error;
      return {
        id: data.id,
        name: data.name,
        email: data.email ?? "",
        whatsapp: data.phone ?? "",
        startDate: data.program_start_date ?? "",
        responsibleId: data.responsible_id ?? "",
        status: data.status ?? "active",
        publicToken: data.public_token ?? "",
        assignedFormId: data.assigned_form_id ?? undefined,
      } as Patient;
    },
  });

  const { data: responses = [] } = useQuery({
    queryKey: ["responses", id],
    queryFn: async () => {
      const { data, error } = (await supabase.from("form_responses").select("*").eq("patient_id", id)) as any;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        patientId: r.patient_id,
        date: r.submitted_at?.slice(0, 10) ?? "",
        programDay: programDay(patient?.startDate ?? ""),
        formId: r.form_id ?? undefined,
        answers: (r.responses ?? []) as ResponseEntry["answers"],
        createdAt: r.submitted_at ?? "",
      })) as ResponseEntry[];
    },
    enabled: !!patient,
  });

  // Busca a definição (campos) de cada formulário referenciado pelas respostas,
  // pra traduzir questionId -> label da pergunta e valor bruto -> texto legível
  // na aba Histórico.
  const formIds = useMemo(
    () => Array.from(new Set(responses.map((r) => r.formId).filter((v): v is string => !!v))),
    [responses],
  );
  const { data: fieldsByFormId = new Map<string, Map<string, FormField>>() } = useQuery({
    queryKey: ["forms", "fields-by-id", formIds],
    queryFn: async () => {
      const { data, error } = (await supabase.from("forms").select("id, fields").in("id", formIds)) as any;
      if (error) throw error;
      const map = new Map<string, Map<string, FormField>>();
      (data ?? []).forEach((f: any) => {
        const fieldMap = new Map<string, FormField>();
        ((f.fields ?? []) as FormField[]).forEach((field) => fieldMap.set(field.id, field));
        map.set(f.id, fieldMap);
      });
      return map;
    },
    enabled: formIds.length > 0,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", id],
    queryFn: async () => {
      const { data, error } = (await supabase.from("appointments").select("*").eq("patient_id", id)) as any;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        patient_id: string;
        professional_id: string | null;
        scheduled_at: string | null;
        status: string | null;
        notes: string | null;
      }>;
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", id],
    queryFn: async () => {
      const { data, error } = (await supabase
        .from("messages")
        .select("*")
        .eq("patient_id", id)
        .order("created_at", { ascending: true })) as any;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        direction: "inbound" | "outbound";
        content: string;
        content_type: string;
        created_at: string;
      }>;
    },
    // Busca de novo a cada 5s enquanto a aba estiver visível — sem isso, uma
    // mensagem nova só aparecia dando refresh na página manualmente. Não busca
    // em background (aba minimizada/outra aba do navegador ativa), pra não
    // gastar requisição à toa.
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = (await supabase.from("profiles").select("id, name")) as any;
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });

  const responsible = users.find((u) => u.id === patient?.responsibleId);
  const crit = criticalityFromResponses(responses);

  const updateStatus = useMutation({
    mutationFn: async (status: "active" | "paused" | "completed") => {
      const { error } = (await supabase.from("patients").update({ status }).eq("id", id)) as any;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", id] });
      qc.invalidateQueries({ queryKey: ["patients", "enriched"] });
      toast.success("Status atualizado");
    },
  });

  const toggleActive = (checked: boolean) => updateStatus.mutate(checked ? "active" : "paused");

  const sendReminder = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/messages/send-form", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ patientIds: [id] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao acionar o envio");
      return body as { sent: number; skipped: Array<{ patientId: string; reason: string }> };
    },
    onSuccess: (result) => {
      if (result.sent > 0) toast.success("Envio acionado");
      else toast.warning("Não foi possível enviar (paciente sem telefone cadastrado ou arquivado)");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar"),
  });

  const [draft, setDraft] = useState("");
  const sendManual = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/messages/send-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ patientId: id, message: draft.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Erro ao enviar");
      return body as { ok: true };
    },
    onSuccess: () => {
      setDraft("");
      toast.success("Mensagem enviada");
      // O registro em `messages` só aparece depois que o n8n confirmar o envio
      // de volta (assíncrono) — não invalida a query aqui pra não mostrar uma
      // lista "vazia" por um instante antes do webhook de confirmação chegar.
    },
    onError: (e) => {
      const code = e instanceof Error ? e.message : "";
      if (code === "outside_24h_window") {
        toast.error(
          "Fora da janela de 24h: o paciente precisa mandar uma mensagem antes de você poder responder livremente.",
        );
      } else if (code === "no_phone") {
        toast.error("Este paciente não tem telefone cadastrado.");
      } else if (code === "patient_archived") {
        toast.error("Paciente arquivado — restaure antes de enviar mensagens.");
      } else {
        toast.error(code || "Erro ao enviar mensagem");
      }
    },
  });

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<EditForm>({
    name: "",
    email: "",
    whatsapp: "",
    startDate: "",
    responsibleId: "",
    status: "active",
  });

  function openEditDialog() {
    if (!patient) return;
    setForm({
      name: patient.name,
      email: patient.email,
      whatsapp: patient.whatsapp,
      startDate: patient.startDate?.slice(0, 10) ?? "",
      responsibleId: patient.responsibleId ?? "",
      status: patient.status,
    });
    setEditOpen(true);
  }

  const saveEdit = useMutation({
    mutationFn: async () => {
      const { error } = (await supabase
        .from("patients")
        .update({
          name: form.name,
          email: form.email,
          phone: form.whatsapp,
          program_start_date: form.startDate,
          status: form.status,
          responsible_id: form.responsibleId || null,
        })
        .eq("id", id)) as any;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", id] });
      qc.invalidateQueries({ queryKey: ["patients", "enriched"] });
      setEditOpen(false);
      toast.success("Paciente atualizado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const COLORS = ["var(--primary)", "var(--success)", "var(--warning)", "var(--danger)", "oklch(0.6 0.15 280)"];

  const [copied, setCopied] = useState(false);
  const publicLink = patient ? `${window.location.origin}/formulario/${patient.publicToken}` : "";
  const copyLink = async () => {
    await navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ---------------------------------------------------------------------
  // Agenda / calendário
  // ---------------------------------------------------------------------
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [apptForm, setApptForm] = useState({ time: "09:00", professionalId: "", notes: "" });

  const appointmentDates = useMemo(
    () => appointments.filter((a) => a.scheduled_at).map((a) => parseISO(a.scheduled_at as string)),
    [appointments],
  );

  const appointmentsForSelectedDay = useMemo(
    () =>
      appointments
        .filter((a) => a.scheduled_at && isSameDay(parseISO(a.scheduled_at as string), selectedDate))
        .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "")),
    [appointments, selectedDate],
  );

  const createAppointment = useMutation({
    mutationFn: async () => {
      const [h, m] = apptForm.time.split(":").map(Number);
      const scheduled = new Date(selectedDate);
      scheduled.setHours(h || 0, m || 0, 0, 0);
      const { error } = await supabase.from("appointments").insert({
        patient_id: id,
        professional_id: apptForm.professionalId || null,
        scheduled_at: scheduled.toISOString(),
        status: "pending",
        notes: apptForm.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", id] });
      setCreateOpen(false);
      setApptForm({ time: "09:00", professionalId: "", notes: "" });
      toast.success("Consulta agendada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao agendar"),
  });

  const updateAppointmentStatus = useMutation({
    mutationFn: async ({ apptId, status }: { apptId: string; status: string }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", apptId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments", id] });
      toast.success("Status atualizado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  if (!patient) return <div className="p-8 text-muted-foreground">Carregando…</div>;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <Link to="/pacientes" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Pacientes
      </Link>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold">{patient.name}</h1>
                <CriticalityBadge level={crit} />
                <Badge variant="outline">{STATUS_LABEL[patient.status]}</Badge>
              </div>
              {patient.startDate && (
                <p className="text-sm text-muted-foreground">
                  Dia {programDay(patient.startDate)} de 30 · Início{" "}
                  {format(parseISO(patient.startDate), "dd MMM yyyy", { locale: ptBR })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="flex items-center gap-2">
                <Switch
                  id="ativo"
                  checked={patient.status === "active"}
                  onCheckedChange={toggleActive}
                  disabled={updateStatus.isPending}
                />
                <Label htmlFor="ativo" className="text-sm text-muted-foreground">
                  Ativo
                </Label>
              </div>
              <Button variant="outline" onClick={openEditDialog}>
                <Pencil className="h-4 w-4 mr-2" /> Editar
              </Button>
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 border-t pt-4">
            <Field label="E-mail" value={patient.email || "—"} />
            <Field label="Telefone" value={patient.whatsapp || "—"} />
            <Field label="Responsável" value={responsible?.name ?? "—"} />
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button asChild variant="outline">
              <Link to="/prontuario/$id" params={{ id }}>
                <FileText className="h-4 w-4 mr-2" /> Prontuário
              </Link>
            </Button>
            <Button variant="outline" onClick={copyLink}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />} Link do formulário
            </Button>
            <Button onClick={() => sendReminder.mutate()} disabled={sendReminder.isPending}>
              {sendReminder.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar lembrete
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="evolution">
        <TabsList>
          <TabsTrigger value="evolution">Evolução</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
          <TabsTrigger value="schedule">Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="evolution">
          <Card>
            <CardHeader><CardTitle className="text-base">Evolução ao longo do programa</CardTitle></CardHeader>
            <CardContent>
              {responses.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Ainda sem respostas registradas.</p>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={responses.map((r) => ({ day: r.programDay, média: +averageOfEntry(r).toFixed(2) }))} margin={{ left: -10, right: 8, top: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis domain={[1, 5]} tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="média" stroke={COLORS[0]} strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle className="text-base">Respostas diárias</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {responses.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma resposta ainda.</p>}
              {[...responses].sort((a, b) => b.programDay - a.programDay).map((r) => {
                const fieldsById = r.formId ? fieldsByFormId.get(r.formId) : undefined;
                return (
                  <div key={r.id} className="rounded-md border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Dia {r.programDay} de 30</div>
                      <div className="text-xs text-muted-foreground">
                        {r.createdAt ? format(parseISO(r.createdAt), "dd MMM yyyy HH:mm", { locale: ptBR }) : "—"}
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {r.answers.map((a, i) => {
                        const field = fieldsById?.get(a.questionId);
                        return (
                          <div key={i} className="text-sm">
                            <div className="text-xs text-muted-foreground">{field?.label ?? a.questionId}</div>
                            <div className="font-medium">{formatAnswerValue(field, a.value)}</div>
                            {a.note && (
                              <div className="text-xs text-muted-foreground italic mt-0.5">&quot;{a.note}&quot;</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversas">
          <Card>
            <CardHeader><CardTitle className="text-base">Conversas via WhatsApp</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center flex flex-col items-center gap-2">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
                  Nenhuma mensagem trocada ainda.
                </p>
              ) : (
                <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                  {messages.map((m) => {
                    const isInbound = m.direction === "inbound";
                    return (
                      <div key={m.id} className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                            isInbound
                              ? "bg-muted text-foreground rounded-bl-sm"
                              : "bg-primary text-primary-foreground rounded-br-sm",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <p
                            className={cn(
                              "text-[10px] mt-1",
                              isInbound ? "text-muted-foreground" : "text-primary-foreground/70",
                            )}
                          >
                            {format(parseISO(m.created_at), "dd MMM yyyy HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 border-t pt-4">
                <Textarea
                  rows={2}
                  placeholder="Escreva uma mensagem…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (draft.trim() && !sendManual.isPending) sendManual.mutate();
                    }
                  }}
                  className="resize-none"
                />
                <Button
                  size="icon"
                  className="shrink-0 self-end"
                  disabled={!draft.trim() || sendManual.isPending}
                  onClick={() => sendManual.mutate()}
                >
                  {sendManual.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Só funciona se o paciente mandou mensagem nas últimas 24h (regra do WhatsApp). Enter
                envia, Shift+Enter quebra linha.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Consultas e check-ins</CardTitle>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Nova consulta
              </Button>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                locale={ptBR}
                modifiers={{ hasAppointment: appointmentDates }}
                modifiersClassNames={{
                  hasAppointment: "font-semibold underline decoration-2 decoration-primary underline-offset-4",
                }}
                className="rounded-md border mx-auto"
              />
              <div className="space-y-2">
                <h4 className="text-sm font-medium capitalize">
                  {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </h4>
                {appointmentsForSelectedDay.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma consulta neste dia.</p>
                ) : (
                  <div className="space-y-2">
                    {appointmentsForSelectedDay.map((a) => {
                      const prof = users.find((u) => u.id === a.professional_id);
                      const status = a.status ?? "pending";
                      return (
                        <div
                          key={a.id}
                          className={cn(
                            "rounded-md border p-3 space-y-1.5 transition-colors",
                            status === "done" && "border-success/40 bg-success/10",
                            status === "cancelled" && "border-danger/30 bg-danger/5",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "text-sm font-medium",
                                status === "cancelled" && "line-through text-muted-foreground",
                              )}
                            >
                              {a.scheduled_at ? format(parseISO(a.scheduled_at), "HH:mm") : "—"}
                              {prof && <span className="text-muted-foreground font-normal"> · {prof.name}</span>}
                            </span>
                            <Select
                              value={status}
                              onValueChange={(v) => updateAppointmentStatus.mutate({ apptId: a.id, status: v })}
                            >
                              <SelectTrigger className="w-32 h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">{APPT_STATUS_LABEL.pending}</SelectItem>
                                <SelectItem value="done">{APPT_STATUS_LABEL.done}</SelectItem>
                                <SelectItem value="cancelled">{APPT_STATUS_LABEL.cancelled}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {a.notes && (
                            <p
                              className={cn(
                                "text-xs text-muted-foreground",
                                status === "cancelled" && "line-through",
                              )}
                            >
                              {a.notes}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova consulta — {format(selectedDate, "dd/MM/yyyy")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Horário</Label>
                  <Input
                    type="time"
                    value={apptForm.time}
                    onChange={(e) => setApptForm({ ...apptForm, time: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Profissional</Label>
                  <Select
                    value={apptForm.professionalId}
                    onValueChange={(v) => setApptForm({ ...apptForm, professionalId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Observações</Label>
                  <Textarea
                    rows={3}
                    placeholder="Opcional"
                    value={apptForm.notes}
                    onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => createAppointment.mutate()} disabled={createAppointment.isPending}>
                  {createAppointment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Agendar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar paciente</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input placeholder="+55..." value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Início do programa</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as EditForm["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Profissional responsável</Label>
              <Select value={form.responsibleId} onValueChange={(v) => setForm({ ...form, responsibleId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm truncate" title={value}>
        {value}
      </div>
    </div>
  );
}