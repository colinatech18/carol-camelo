import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Activity, Users as UsersIcon, TrendingUp, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CriticalityBadge } from "@/components/CriticalityBadge";
import { useEnrichedPatients } from "@/hooks/useEnrichedPatients";
import { api } from "@/services/api";
import { averageOfEntry } from "@/lib/criticality";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceArea } from "recharts";

export const Route = createFileRoute("/_app/dashboard")({ component: DashboardPage });

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

function DashboardPage() {
  const { data: patients = [], isLoading } = useEnrichedPatients();
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.auth.listUsers });
  const [responsibleFilter, setResponsibleFilter] = useState<string>("all");

  const filtered = useMemo(
    () => patients.filter((p) => p.status === "active" && (responsibleFilter === "all" || p.responsibleId === responsibleFilter)),
    [patients, responsibleFilter]
  );

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0, unknown: 0 };
    filtered.forEach((p) => { c[p.criticality]++; });
    return c;
  }, [filtered]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const respondedToday = filtered.filter((p) => p.responses.some((r) => r.date === todayStr)).length;
  const responseRate = filtered.length ? Math.round((respondedToday / filtered.length) * 100) : 0;

  const noResponseRecent = filtered.filter((p) => (p.daysSinceLast ?? 999) >= 2);

  const chartData = useMemo(() => {
    const days: Record<number, number[]> = {};
    filtered.forEach((p) => p.responses.forEach((r) => {
      (days[r.programDay] ??= []).push(averageOfEntry(r));
    }));
    return Object.entries(days)
      .map(([d, arr]) => ({ day: Number(d), media: +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2) }))
      .sort((a, b) => a.day - b.day);
  }, [filtered]);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral dos pacientes ativos no programa.</p>
        </div>
        <div className="w-60">
          <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
            <SelectTrigger><SelectValue placeholder="Profissional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={UsersIcon} label="Pacientes ativos" value={filtered.length} hint="no programa" />
        <MetricCard icon={Activity} label="Distribuição" value={`${counts.red} / ${counts.yellow} / ${counts.green}`} hint="Crítico / Atenção / Estável" />
        <MetricCard icon={TrendingUp} label="Taxa de resposta hoje" value={`${responseRate}%`} hint={`${respondedToday}/${filtered.length} responderam`} />
        <MetricCard icon={AlertCircle} label="Sem resposta 2+ dias" value={noResponseRecent.length} hint="requer lembrete" tone={noResponseRecent.length > 0 ? "danger" : "default"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Evolução média (todos os pacientes)</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Sem dados ainda.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: -10, right: 56, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <ReferenceArea y1={1} y2={2.5} fill="#ef444420" ifOverflow="extendDomain" label={{ value: "Crítico", position: "right", fill: "#ef4444", fontSize: 10, offset: 8 }} />
                    <ReferenceArea y1={2.5} y2={3.5} fill="#eab30820" ifOverflow="extendDomain" label={{ value: "Atenção", position: "right", fill: "#eab308", fontSize: 10, offset: 8 }} />
                    <ReferenceArea y1={3.5} y2={5} fill="#22c55e20" ifOverflow="extendDomain" label={{ value: "Estável", position: "right", fill: "#22c55e", fontSize: 10, offset: 8 }} />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} label={{ value: "Dia do programa", position: "insideBottom", offset: -2, fontSize: 11 }} />
                    <YAxis domain={[1, 5]} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="media" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sem resposta há 2+ dias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {noResponseRecent.length === 0 && <p className="text-sm text-muted-foreground">Todos em dia 👏</p>}
            {noResponseRecent.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/40 transition">
                <div className={cn("h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold", avatarColor(p.name))}>
                  {initials(p.name)}
                </div>
                <Link to="/pacientes/$id" params={{ id: p.id }} className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">Última: {p.daysSinceLast ?? "—"} dias atrás</div>
                </Link>
                <CriticalityBadge level={p.criticality} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toast.success(`Lembrete enviado para ${p.name}`);
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Lembrete
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pacientes ativos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          <div className="divide-y">
            {filtered.map((p) => {
              const pct = Math.round((p.programDay / 30) * 100);
              return (
                <Link key={p.id} to="/pacientes/$id" params={{ id: p.id }} className="flex items-center gap-3 py-3 hover:bg-muted/30 -mx-2 px-2 rounded-md transition">
                  <div className={cn("h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold", avatarColor(p.name))}>
                    {initials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground mb-1.5">Dia {p.programDay} de 30</div>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", CRIT_BAR[p.criticality])} style={{ width: `${pct}%` }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Dia {p.programDay} de 30</TooltipContent>
                    </UITooltip>
                  </div>
                  <CriticalityBadge level={p.criticality} />
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}

function MetricCard({ icon: Icon, label, value, hint, tone = "default" }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; hint?: string; tone?: "default" | "danger" }) {
  const isDanger = tone === "danger";
  return (
    <Card className={cn(isDanger && "border-red-500/40 bg-red-500/5")}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <Icon className={isDanger ? "h-4 w-4 text-red-400" : "h-4 w-4 text-primary"} />
        </div>
        <div className={cn("mt-2 text-2xl font-semibold", isDanger && "text-red-400")}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
