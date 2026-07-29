import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Copy, Check, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CriticalityBadge } from "@/components/CriticalityBadge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { criticalityFromResponses, programDay, averageOfEntry } from "@/lib/criticality";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";
import type { Patient, ResponseEntry } from "@/types";

export const Route = createFileRoute("/_app/pacientes/$id")({ component: PatientDetail });

const STATUS_LABEL = { active: "Ativo", completed: "Concluído", paused: "Pausado" } as const;

type EditForm = {
  name: string;
  email: string;
  whatsapp: string;
  startDate: string;
  responsibleId: string;
  status: "active" | "paused" | "completed";
};

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
        answers: r.responses ?? [],
        createdAt: r.submitted_at ?? "",
      })) as ResponseEntry[];
    },
    enabled: !!patient,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", id],
    queryFn: async () => {
      const { data, error } = (await supabase.from("appointments").select("*").eq("patient_id", id)) as any;
      if (error) throw error;
      return data ?? [];
    },
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
            <Button onClick={() => toast.info("Lembrete será enviado via n8n")}>
              <Send className="h-4 w-4 mr-2" /> Enviar lembrete
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="evolution">
        <TabsList>
          <TabsTrigger value="evolution">Evolução</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
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
              {[...responses].sort((a, b) => b.programDay - a.programDay).map((r) => (
                <div key={r.id} className="rounded-md border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Dia {r.programDay} de 30</div>
                    <div className="text-xs text-muted-foreground">
                      {r.createdAt ? format(parseISO(r.createdAt), "dd MMM yyyy HH:mm", { locale: ptBR }) : "—"}
                    </div>
                  </div>
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {JSON.stringify(r.answers, null, 2)}
                  </pre>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader><CardTitle className="text-base">Consultas e check-ins</CardTitle></CardHeader>
            <CardContent>
              {appointments.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma consulta agendada.</p>}
              <div className="divide-y">
                {appointments.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium">{a.notes ?? "Consulta"}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.scheduled_at ? format(parseISO(a.scheduled_at), "dd MMM yyyy", { locale: ptBR }) : "—"}
                      </div>
                    </div>
                    <Badge variant={a.status === "done" ? "default" : "outline"}>
                      {a.status === "done" ? "Realizado" : "Pendente"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
