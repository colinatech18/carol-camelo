import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Copy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CriticalityBadge } from "@/components/CriticalityBadge";
import { useEnrichedPatients } from "@/hooks/useEnrichedPatients";
import { api } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/pacientes/")({ component: PatientsList });

const STATUS_LABEL = { active: "Ativo", completed: "Concluído", paused: "Pausado" } as const;

function PatientsList() {
  const { data: patients = [], isLoading } = useEnrichedPatients();
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.auth.listUsers });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = patients.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.email.toLowerCase().includes(q.toLowerCase()));

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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo paciente</Button>
            </DialogTrigger>
            <NewPatientDialog users={users} onClose={() => setOpen(false)} />
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="text-sm text-muted-foreground p-6">Carregando…</p>}
          <div className="divide-y">
            {filtered.map((p) => {
              const responsible = users.find((u) => u.id === p.responsibleId);
              return (
                <Link key={p.id} to="/pacientes/$id" params={{ id: p.id }} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition">
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
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground p-6 text-center">Nenhum paciente encontrado.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NewPatientDialog({ users, onClose }: { users: Array<{ id: string; name: string }>; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "", startDate: new Date().toISOString().slice(0, 10), responsibleId: users[0]?.id ?? "", status: "active" as const });
  const m = useMutation({
    mutationFn: () => api.patients.create({ ...form, startDate: new Date(form.startDate).toISOString() }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["patients", "enriched"] });
      toast.success("Paciente cadastrado");
      const url = `${window.location.origin}/formulario/${p.publicToken}`;
      navigator.clipboard.writeText(url).catch(() => undefined);
      toast.message("Link do formulário copiado para a área de transferência");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao cadastrar"),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo paciente</DialogTitle>
      </DialogHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>WhatsApp</Label><Input required placeholder="+55..." value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Início do programa</Label><Input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Profissional responsável</Label>
            <Select value={form.responsibleId} onValueChange={(v) => setForm({ ...form, responsibleId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={m.isPending}>Cadastrar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
