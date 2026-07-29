import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Download, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { CriticalityBadge } from "@/components/CriticalityBadge";
import { useEnrichedPatients } from "@/hooks/useEnrichedPatients";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import type { Patient } from "@/types";

export const Route = createFileRoute("/_app/pacientes/")({ component: PatientsList });

const STATUS_LABEL = { active: "Ativo", completed: "Concluído", paused: "Pausado" } as const;
const STATUS_DOT: Record<string, string> = {
  active: "bg-green-500",
  paused: "bg-amber-500",
  completed: "bg-blue-500",
};
const STATUS_RANK: Record<string, number> = { active: 0, paused: 1, completed: 2 };

const AVATAR_PALETTE = [
  "bg-blue-500/20 text-blue-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-amber-500/20 text-amber-300",
  "bg-rose-500/20 text-rose-300",
  "bg-violet-500/20 text-violet-300",
  "bg-cyan-500/20 text-cyan-300",
];
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
function avatarColor(name: string) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
}
const CRIT_BAR: Record<string, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  unknown: "bg-muted-foreground/40",
};
const CRIT_LABEL: Record<string, string> = {
  red: "Crítico",
  yellow: "Atenção",
  green: "Estável",
  unknown: "Sem dados",
};
const CRIT_RANK: Record<string, number> = { red: 0, yellow: 1, green: 2, unknown: 3 };

type SortKey = "name" | "startDate" | "programDay" | "criticality" | "status";

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

// Escapa uma célula para CSV com delimitador ";" (mais amigável ao Excel pt-BR).
function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function PatientsList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "completed">("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<PatientForm>(emptyForm);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "";

  const filtered = useMemo(() => {
    const term = q.toLowerCase();
    return patients.filter(
      (p) =>
        (statusFilter === "all" || p.status === statusFilter) &&
        (p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term)),
    );
  }, [patients, q, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name, "pt-BR");
          break;
        case "startDate":
          cmp = (a.startDate || "").localeCompare(b.startDate || "");
          break;
        case "programDay":
          cmp = a.programDay - b.programDay;
          break;
        case "criticality":
          cmp = CRIT_RANK[a.criticality] - CRIT_RANK[b.criticality];
          break;
        case "status":
          cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status];
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  const sortHead = (label: string, key: SortKey, className?: string) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="inline-flex items-center gap-1 hover:text-foreground transition"
      >
        {label}
        {sortBy === key ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  function exportCsv() {
    const header = ["Nome", "E-mail", "Telefone", "Responsável", "Início", "Dia", "Criticidade", "Status"];
    const rows = sorted.map((p) => [
      p.name,
      p.email,
      p.whatsapp,
      userName(p.responsibleId),
      p.startDate,
      p.programDay,
      CRIT_LABEL[p.criticality],
      STATUS_LABEL[p.status],
    ]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pacientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

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
          responsible_id: form.responsibleId || null,
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
          responsible_id: form.responsibleId || null,
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 w-56" placeholder="Buscar paciente…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="paused">Pausado</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv} disabled={sorted.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Novo paciente</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-6">Carregando…</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {sortHead("Paciente", "name")}
                    <TableHead>Responsável</TableHead>
                    {sortHead("Início", "startDate", "hidden md:table-cell")}
                    {sortHead("Programa", "programDay", "hidden lg:table-cell")}
                    {sortHead("Criticidade", "criticality")}
                    {sortHead("Status", "status")}
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((p) => {
                    const pct = Math.round((p.programDay / 30) * 100);
                    const respName = userName(p.responsibleId);
                    const contact = [p.email, p.whatsapp].filter(Boolean).join(" · ");
                    return (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => navigate({ to: "/pacientes/$id", params: { id: p.id } })}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn("h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold", avatarColor(p.name))}>
                              {initials(p.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{p.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{contact || "—"}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {respName ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={cn("h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold", avatarColor(respName))}>
                                {initials(respName)}
                              </div>
                              <span className="text-sm truncate">{respName}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                          {p.startDate ? format(parseISO(p.startDate), "dd MMM yyyy", { locale: ptBR }) : "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="w-28">
                            <div className="text-xs text-muted-foreground mb-1">Dia {p.programDay}/30</div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all", CRIT_BAR[p.criticality])} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <CriticalityBadge level={p.criticality} />
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
                            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[p.status])} />
                            {STATUS_LABEL[p.status]}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={(e) => openEdit(p, e)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                        Nenhum paciente encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                {sorted.length} de {patients.length} paciente(s)
              </div>
            </>
          )}
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
