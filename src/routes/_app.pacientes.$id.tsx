import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bold, Italic, List, ListOrdered, MessageSquare, Send, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CriticalityBadge } from "@/components/CriticalityBadge";
import { api } from "@/services/api";
import { useAuth } from "@/lib/auth-context";
import { criticalityFromResponses, programDay, averageOfEntry } from "@/lib/criticality";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/_app/pacientes/$id")({ component: PatientDetail });

const STATUS_LABEL = { active: "Ativo", completed: "Concluído", paused: "Pausado" } as const;

function PatientDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: patient } = useQuery({ queryKey: ["patient", id], queryFn: () => api.patients.get(id) });
  const { data: responses = [] } = useQuery({ queryKey: ["responses", id], queryFn: () => api.forms.getResponses(id) });
  const { data: questions = [] } = useQuery({ queryKey: ["questions"], queryFn: api.forms.getQuestions });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments", id], queryFn: () => api.appointments.list(id) });
  const { data: records = [] } = useQuery({ queryKey: ["records", id], queryFn: () => api.records.list(id) });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.auth.listUsers });

  const responsible = users.find((u) => u.id === patient?.responsibleId);
  const crit = criticalityFromResponses(responses);

  const updateStatus = useMutation({
    mutationFn: (status: "active" | "paused" | "completed") => api.patients.update(id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["patient", id] }); qc.invalidateQueries({ queryKey: ["patients", "enriched"] }); toast.success("Status atualizado"); },
  });

  const sendReminder = useMutation({
    mutationFn: () => api.notifications.sendReminder(id),
    onSuccess: () => toast.success("Lembrete enviado"),
    onError: () => toast.error("Falha ao enviar lembrete"),
  });

  const chartData = useMemo(() => {
    return responses.map((r) => {
      const row: Record<string, number | string> = { day: r.programDay, média: +averageOfEntry(r).toFixed(2) };
      r.answers.forEach((a) => {
        const q = questions.find((q) => q.id === a.questionId);
        if (q) row[q.text.slice(0, 18)] = a.value;
      });
      return row;
    });
  }, [responses, questions]);

  const COLORS = ["var(--primary)", "var(--success)", "var(--warning)", "var(--danger)", "oklch(0.6 0.15 280)"];

  const [copied, setCopied] = useState(false);
  const publicLink = patient ? `${typeof window !== "undefined" ? window.location.origin : ""}/formulario/${patient.publicToken}` : "";
  const copyLink = async () => { await navigator.clipboard.writeText(publicLink); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (!patient) return <div className="p-8 text-muted-foreground">Carregando…</div>;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <Link to="/pacientes" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 mr-1" /> Pacientes</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{patient.name}</h1>
            <CriticalityBadge level={crit} />
            <Badge variant="outline">{STATUS_LABEL[patient.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{patient.email} · {patient.whatsapp} · Responsável: {responsible?.name ?? "—"}</p>
          <p className="text-sm text-muted-foreground">Dia {programDay(patient.startDate)} de 30 · Início {format(parseISO(patient.startDate), "dd MMM yyyy", { locale: ptBR })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={patient.status} onValueChange={(v) => updateStatus.mutate(v as "active" | "paused" | "completed")}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="paused">Pausado</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={copyLink}>{copied ? <Check className="h-4 w-4 mr-2"/> : <Copy className="h-4 w-4 mr-2" />} Link do formulário</Button>
          <Button onClick={() => sendReminder.mutate()} disabled={sendReminder.isPending}>
            <Send className="h-4 w-4 mr-2" /> Enviar lembrete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="evolution">
        <TabsList>
          <TabsTrigger value="evolution">Evolução</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="schedule">Agenda</TabsTrigger>
          <TabsTrigger value="records">Prontuário</TabsTrigger>
        </TabsList>

        <TabsContent value="evolution">
          <Card>
            <CardHeader><CardTitle className="text-base">Evolução ao longo do programa</CardTitle></CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Ainda sem respostas registradas.</p>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ left: -10, right: 8, top: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis domain={[1, 5]} tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {questions.map((q, i) => (
                        <Line key={q.id} type="monotone" dataKey={q.text.slice(0, 18)} stroke={COLORS[(i + 1) % COLORS.length]} strokeWidth={1.5} dot={false} />
                      ))}
                      <Line type="monotone" dataKey="média" stroke="var(--primary)" strokeWidth={3} dot={{ r: 3 }} />
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
              {[...responses].sort((a, b) => b.programDay - a.programDay).map((r) => (
                <div key={r.id} className="rounded-md border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Dia {r.programDay} de 30</div>
                    <div className="text-xs text-muted-foreground">{format(parseISO(r.createdAt), "dd MMM yyyy HH:mm", { locale: ptBR })}</div>
                  </div>
                  <div className="space-y-2">
                    {r.answers.map((a) => {
                      const q = questions.find((q) => q.id === a.questionId);
                      return (
                        <div key={a.questionId} className="text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{q?.text ?? a.questionId}</span>
                            <span className="font-semibold tabular-nums">{a.value}/5</span>
                          </div>
                          {a.note && <div className="text-xs text-muted-foreground italic mt-0.5">"{a.note}"</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader><CardTitle className="text-base">Consultas e check-ins</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y">
                {appointments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium">{a.label}</div>
                      <div className="text-xs text-muted-foreground">{format(parseISO(a.scheduledDate), "dd MMM yyyy", { locale: ptBR })}</div>
                    </div>
                    <ToggleStatus id={a.id} status={a.status} patientId={id} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="records">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-3">
              {records.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma anotação ainda.</p>}
              {records.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">{r.authorName}</div>
                      <div className="text-xs text-muted-foreground">{format(parseISO(r.createdAt), "dd MMM yyyy HH:mm", { locale: ptBR })}</div>
                    </div>
                    <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: r.content }} />
                  </CardContent>
                </Card>
              ))}
            </div>
            <RecordEditor patientId={id} authorId={user!.id} authorName={user!.name} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToggleStatus({ id, status, patientId }: { id: string; status: "pending" | "done"; patientId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.appointments.updateStatus(id, status === "done" ? "pending" : "done"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments", patientId] }),
  });
  return (
    <Button size="sm" variant={status === "done" ? "secondary" : "outline"} onClick={() => m.mutate()}>
      {status === "done" ? "Realizado" : "Marcar realizado"}
    </Button>
  );
}

function RecordEditor({ patientId, authorId, authorName }: { patientId: string; authorId: string; authorName: string }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const m = useMutation({
    mutationFn: () => {
      const html = ref.current?.innerHTML.trim() ?? "";
      if (!html) throw new Error("Vazio");
      return api.records.create({ patientId, authorId, authorName, content: html });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records", patientId] });
      if (ref.current) ref.current.innerHTML = "";
      toast.success("Anotação salva");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const cmd = (c: string) => { document.execCommand(c, false); ref.current?.focus(); };

  return (
    <Card className="self-start sticky top-6">
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Nova anotação</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1 border rounded-md p-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => cmd("bold")}><Bold className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => cmd("italic")}><Italic className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => cmd("insertUnorderedList")}><List className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => cmd("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></Button>
        </div>
        <div
          ref={ref}
          contentEditable
          className="min-h-32 rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring prose prose-sm max-w-none"
          suppressContentEditableWarning
        />
        <Button className="w-full" onClick={() => m.mutate()} disabled={m.isPending}>Salvar anotação</Button>
      </CardContent>
    </Card>
  );
}
