import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CriticalityBadge } from "@/components/CriticalityBadge";
import { useEnrichedPatients } from "@/hooks/useEnrichedPatients";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Patient } from "@/types";

export const Route = createFileRoute("/_app/pacientes/")({ component: PatientsList });

const STATUS_LABEL = { active: "Ativo", completed: "Concluído", paused: "Pausado" } as const;

type PatientForm = {
  name: string;
  email: string;
  whatsapp: string;
  startDate: string;
  responsibleId: string;
  status: "active" | "completed" | "paused";
  notes: string;
};

const emptyForm: PatientForm = {
  name: "", email: "", whatsapp: "",
  startDate: new Date().toISOString().slice(0, 10),
  responsibleId: "", status: "active", notes: "",
};

function PatientsList() {
  const qc = useQueryClient();
  const { data: patients = [], isLoading } = useEnrichedPatients();
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = (await supabase.from("profiles").select("id, name")) as any;
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<PatientForm>(emptyForm);

  const filtered = patients.filter(
    (p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.email.toLowerCase().includes(q.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, responsibleId: users[0]?.id ?? "" });
    setOpen(true);
  }

  function openEdit(p: Patient, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditing(p);
    setForm({
      name: p.name,
      email: p.email,
      whatsapp: p.whatsapp,
      startDate: p.startDate?.slice(0, 10) ?? "",
      responsibleId: p.responsibleId ?? "",
      status: p.status,
      notes: "",
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = (await supabase.from("patients").update({
          name: form.name,
          email: form.email,
          phone: form.whatsapp,
          program_start_date: form.startDate,
          status: form.status,
        }).eq("id", editing.id)) as any;
        if (error) throw error;
      } else {
        const token = crypto.randomUUID();
        const { error } = (await supabase.from("patients").insert({
          name: form.name,
          email: form.email,
          phone: form.whatsapp,
          program_start_date: form.startDate,
          status: form.status,
          notes: form.notes,
          public_token: token,
        })) as any;
        if (error) throw error;
        const url = `${window.location.origin}/formulario/${token}`;
        navigator.clipboard.writeText(url).catch(() => undefined);
        toast.message("Link do formulário copiado para a área de transferência");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients", "enriched"] });
      toast.success(editing ? "Paciente atualizado" : "Paciente cadastrado");
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pacientes</h1>
          <p className="text-sm text-muted-foreground">Gerencie pacientes e acompanhe o programa de 30 dias.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 w-64" placeholder="Buscar paciente…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Novo paciente</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="text-sm text-muted-foreground p-6">Carregando…</p>}
          <div className="divide-y">
            {filtered.map((p) => {
              const responsible = users.find((u) => u.id === p.responsibleId);
              return (
                <div key={p.id} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition">
                  <Link to="/pacientes/$id" params={{ id: p.id }} className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <Badge variant="outline">{STATUS_LABEL[p.status]}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {p.email} · {p.whatsapp} · {responsible?.name ?? "—"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">Dia {p.programDay}/30</div>
                    </div>
                    <CriticalityBadge level={p.criticality} />
                  </Link>
                  <Button size="icon" variant="ghost" onClick={(e) => openEdit(p, e)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground p-6 text-center">Nenhum paciente encontrado.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar paciente" : "Novo paciente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nome</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as PatientForm["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                    <SelectItem value="paused">Pausado</SelectItem>
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
