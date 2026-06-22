import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, UserPlus, User as UserIcon, Mail, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/services/api";
import { loadForms } from "@/lib/forms-store";
import {
  loadAppearance, saveAppearance, applyAppearance,
  type Appearance, type ThemeMode, type WeekStart, type TimeFormat, type DateFormat,
} from "@/lib/appearance";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import type { Role, User } from "@/types";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/configuracoes")({ component: SettingsPage });

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  psicologo: "Psicólogo",
  psiquiatra: "Psiquiatra",
  recepcionista: "Recepcionista",
};

const LS = {
  defaultForm: "mh.settings.defaultForm",
  notifications: "mh.settings.notifications",
  externalEhr: "mh.settings.externalEhr",
  profile: "mh.settings.profile",
  preferences: "mh.settings.preferences",
  theme: "mh.theme",
};

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Equipe, automações e integrações.</p>
      </div>

      <Tabs defaultValue={user?.role === "admin" ? "geral" : "perfil"} className="space-y-6">
        <TabsList>
          {user?.role === "admin" && <TabsTrigger value="geral">Configuração Geral</TabsTrigger>}
          {user?.role === "admin" && <TabsTrigger value="integracoes">Integrações</TabsTrigger>}
          <TabsTrigger value="perfil">Meu Perfil</TabsTrigger>
          <TabsTrigger value="aparencia">Aparência</TabsTrigger>
        </TabsList>

        {user?.role === "admin" && (
          <TabsContent value="geral" className="space-y-6">
            <TeamCard />
            <DefaultFormCard />
            <NotificationsCard />
          </TabsContent>
        )}

        {user?.role === "admin" && (
          <TabsContent value="integracoes" className="space-y-6">
            <WhatsappCard />
            <ExternalEhrCard />
          </TabsContent>
        )}

        <TabsContent value="integracoes" className="space-y-6">
          <WhatsappCard />
          <ExternalEhrCard />
          
        </TabsContent>

        <TabsContent value="perfil">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="aparencia">
          <AppearanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================== MEU PERFIL ============================== */

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 55% 45%)`;
}

type Preferences = { darkMode: boolean; emailNotifications: boolean; language: string };

function applyTheme(dark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", dark);
}

function ProfileTab() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stored = readLS<{ name?: string }>(LS.profile, {});
  const [name, setName] = useState<string>(stored.name || user?.name || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (!stored.name && user?.name) setName(user.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  async function save() {
    if (password || confirm) {
      if (password !== confirm) { toast.error("As senhas não coincidem"); return; }
      if (password.length < 6) { toast.error("A senha deve ter ao menos 6 caracteres"); return; }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { toast.error(error.message); return; }
    }
    if (user?.id) {
      const { error } = (await supabase.from("profiles").update({ name }).eq("id", user.id)) as any;
      if (error) { toast.error(error.message); return; }
    }
    setPassword("");
    setConfirm("");
    toast.success("Alterações salvas");
  }

  const displayName = name || user?.name || "Usuário";
  const email = user?.email || "";

  return (
    <div className="space-y-8">
      {/* PERFIL */}
      <section className="grid lg:grid-cols-10 gap-6">
        <div className="lg:col-span-3">
          <h3 className="text-base font-semibold">Perfil</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Suas informações pessoais e configurações de segurança da conta.
          </p>
        </div>
        <Card className="lg:col-span-7">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div
                className="h-16 w-16 rounded-full grid place-content-center text-white text-lg font-semibold shadow"
                style={{ background: colorFromName(displayName) }}
                aria-hidden
              >
                {initialsOf(displayName)}
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold">{displayName}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => fileRef.current?.click()}
                >
                  Alterar foto
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={() => toast.info("Upload de avatar em breve")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <div className="relative">
                <UserIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={email} disabled />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nova senha</Label>
              <div className="relative">
                <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  className="pl-9"
                  placeholder="Insira a nova senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {password.length > 0 && (
              <div className="space-y-1.5">
                <Label>Confirmar nova senha</Label>
                <div className="relative">
                  <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    className="pl-9"
                    placeholder="Repita a nova senha"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={save}>Salvar alterações</Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ============================== EQUIPE ============================== */

function TeamCard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "psicologo" as Role, password: "" });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = (await supabase.from("profiles").select("*")) as any;
      if (error) throw error;
      return data as User[];
    },
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); toast.success("Membro adicionado"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const removeUser = useMutation({
    mutationFn: async (id: string) => {
      const { error } = (await supabase.from("profiles").delete().eq("id", id)) as any;
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Removido"); },
  });

  function handleSubmit() {
    if (!form.name || !form.email || !form.password) { toast.error("Preencha nome, e-mail e senha"); return; }
    createUser.mutate();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Equipe</CardTitle>
          <CardDescription>Profissionais com acesso ao sistema.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setForm({ name: "", email: "", role: "psicologo", password: "" })}>
              <UserPlus className="h-4 w-4 mr-2" /> Adicionar membro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Adicionar membro</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="psicologo">Psicólogo</SelectItem>
                    <SelectItem value="psiquiatra">Psiquiatra</SelectItem>
                    <SelectItem value="recepcionista">Recepcionista</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Senha provisória</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createUser.isPending}>Adicionar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-2.5">
              <div>
                <div className="text-sm font-medium">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.email} · {ROLE_LABEL[u.role]}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => removeUser.mutate(u.id)}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ========================= FORMULÁRIO PADRÃO ========================= */

function DefaultFormCard() {
  const [forms] = useState(() => (typeof window !== "undefined" ? loadForms() : []));
  const [selected, setSelected] = useState<string>(() => readLS(LS.defaultForm, ""));

  function save() {
    writeLS(LS.defaultForm, selected);
    toast.success("Formulário padrão salvo");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Formulário padrão</CardTitle>
        <CardDescription>
          Formulário diário enviado aos pacientes durante os 30 dias de acompanhamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Formulário ativo</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder={forms.length ? "Selecione um formulário" : "Nenhum formulário cadastrado"} />
            </SelectTrigger>
            <SelectContent>
              {forms.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Cadastre formulários em <span className="font-medium">Formulários</span>.
          </p>
        </div>
        <Button onClick={save} disabled={!selected}>Salvar</Button>
      </CardContent>
    </Card>
  );
}

/* ============================ NOTIFICAÇÕES ============================ */

type NotificationPrefs = { inactivity2d: boolean; redStatus: boolean };

function NotificationsCard() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
    readLS<NotificationPrefs>(LS.notifications, { inactivity2d: true, redStatus: true }),
  );
  useEffect(() => { writeLS(LS.notifications, prefs); }, [prefs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notificações</CardTitle>
        <CardDescription>Alertas automáticos por e-mail para a equipe.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Inatividade do paciente</div>
            <p className="text-xs text-muted-foreground">
              Notifica a equipe quando um paciente não responde há 2 dias ou mais.
            </p>
          </div>
          <Switch checked={prefs.inactivity2d} onCheckedChange={(v) => setPrefs({ ...prefs, inactivity2d: v })} />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Status crítico (vermelho)</div>
            <p className="text-xs text-muted-foreground">
              Notifica quando um paciente entra em status vermelho.
            </p>
          </div>
          <Switch checked={prefs.redStatus} onCheckedChange={(v) => setPrefs({ ...prefs, redStatus: v })} />
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================== WHATSAPP ============================== */

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 2) return d ? `+${d}` : "";
  if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`;
  if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`;
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
}

function WhatsappCard() {
  const qc = useQueryClient();
  const { data: whatsapp } = useQuery({ queryKey: ["whatsapp"], queryFn: api.settings.getWhatsapp });
  const { data: template } = useQuery({ queryKey: ["template"], queryFn: api.settings.getTemplate });

  const [phone, setPhone] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [tpl, setTpl] = useState("");

  useEffect(() => {
    if (whatsapp) {
      setApiKey(whatsapp.apiKey || "");
      setPhone(maskPhone(whatsapp.phoneNumberId || ""));
    }
  }, [whatsapp]);
  useEffect(() => { if (template) setTpl(template.body); }, [template]);

  const saveAll = useMutation({
    mutationFn: async () => {
      await api.settings.saveWhatsapp({ apiKey, phoneNumberId: phone.replace(/\D/g, "") });
      await api.settings.saveTemplate({ body: tpl });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp"] });
      qc.invalidateQueries({ queryKey: ["template"] });
      toast.success("Integração do WhatsApp salva");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">WhatsApp Business API</CardTitle>
        <CardDescription>Envio automático de lembretes diários para os pacientes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Número do WhatsApp</Label>
          <Input
            placeholder="+55 (11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(maskPhone(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>API Key / Token de acesso</Label>
          <Input type="password" placeholder="••••••••" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Template de mensagem de lembrete</Label>
          <Textarea rows={4} value={tpl} onChange={(e) => setTpl(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Variáveis disponíveis: <code>{"{nome}"}</code>, <code>{"{dias_sem_resposta}"}</code>, <code>{"{link}"}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => saveAll.mutate()} disabled={saveAll.isPending}>Salvar</Button>
          <Button variant="outline" onClick={() => toast.success("Conexão testada com sucesso (mock)")}>
            Testar conexão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ========================= PRONTUÁRIO EXTERNO ========================= */

type ExternalEhr = { url: string; token: string };

function ExternalEhrCard() {
  const [data, setData] = useState<ExternalEhr>(() => readLS<ExternalEhr>(LS.externalEhr, { url: "", token: "" }));
  const configured = Boolean(data.url && data.token);

  function save() {
    writeLS(LS.externalEhr, data);
    toast.success("Configuração de prontuário salva");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Prontuário externo</CardTitle>
            <CardDescription>Conecte uma plataforma externa de prontuário eletrônico.</CardDescription>
          </div>
          <Badge variant={configured ? "default" : "secondary"}>
            {configured ? "Configurado" : "Não configurado"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>URL da plataforma</Label>
          <Input placeholder="https://" value={data.url} onChange={(e) => setData({ ...data, url: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Token de API</Label>
          <Input type="password" placeholder="••••••••" value={data.token} onChange={(e) => setData({ ...data, token: e.target.value })} />
        </div>
        <Button onClick={save}>Salvar</Button>
      </CardContent>
    </Card>
  );
}


/* ============================== APARÊNCIA ============================== */


const PRESET_COLORS: Array<{ name: string; hex: string }> = [
  { name: "Cinza", hex: "#6b7280" },
  { name: "Violeta", hex: "#7c3aed" },
  { name: "Azul", hex: "#2563eb" },
  { name: "Rosa", hex: "#ec4899" },
  { name: "Roxo", hex: "#9333ea" },
  { name: "Índigo", hex: "#4f46e5" },
  { name: "Laranja", hex: "#f97316" },
  { name: "Ciano", hex: "#0891b2" },
  { name: "Areia", hex: "#a8855a" },
  { name: "Verde", hex: "#10b981" },
];

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Noronha",
];

function SectionRow({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid lg:grid-cols-10 gap-6">
      <div className="lg:col-span-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="lg:col-span-7">{children}</div>
    </section>
  );
}

function ThemePreview({ variant }: { variant: "light" | "dark" | "auto" }) {
  if (variant === "auto") {
    return (
      <svg viewBox="0 0 120 80" className="w-full h-20 rounded-md border">
        <defs>
          <clipPath id="left"><rect x="0" y="0" width="60" height="80" /></clipPath>
          <clipPath id="right"><rect x="60" y="0" width="60" height="80" /></clipPath>
        </defs>
        <g clipPath="url(#left)">
          <rect width="120" height="80" fill="#ffffff" />
          <rect x="0" y="0" width="28" height="80" fill="#f1f5f9" />
          <rect x="36" y="12" width="70" height="6" rx="2" fill="#cbd5e1" />
          <rect x="36" y="26" width="50" height="4" rx="2" fill="#e2e8f0" />
        </g>
        <g clipPath="url(#right)">
          <rect width="120" height="80" fill="#0f172a" />
          <rect x="0" y="0" width="28" height="80" fill="#1e293b" />
          <rect x="36" y="12" width="70" height="6" rx="2" fill="#475569" />
          <rect x="36" y="26" width="50" height="4" rx="2" fill="#334155" />
        </g>
      </svg>
    );
  }
  const dark = variant === "dark";
  const bg = dark ? "#0f172a" : "#ffffff";
  const side = dark ? "#1e293b" : "#f1f5f9";
  const l1 = dark ? "#475569" : "#cbd5e1";
  const l2 = dark ? "#334155" : "#e2e8f0";
  return (
    <svg viewBox="0 0 120 80" className="w-full h-20 rounded-md border">
      <rect width="120" height="80" fill={bg} />
      <rect x="0" y="0" width="28" height="80" fill={side} />
      <rect x="36" y="12" width="70" height="6" rx="2" fill={l1} />
      <rect x="36" y="26" width="50" height="4" rx="2" fill={l2} />
      <rect x="36" y="36" width="60" height="4" rx="2" fill={l2} />
    </svg>
  );
}

function AppearanceTab() {
  const [a, setA] = useState<Appearance>(() => loadAppearance());

  function update(patch: Partial<Appearance>) {
    const next = { ...a, ...patch };
    setA(next);
    saveAppearance(next);
    applyAppearance(next);
  }

  return (
    <div className="space-y-8">

      <SectionRow
        title="Aparência"
        description="Escolha o modo claro, escuro, ou automático com base no sistema."
      >
        <div className="grid grid-cols-3 gap-3">
          {(["light", "dark", "auto"] as ThemeMode[]).map((m) => {
            const label = m === "light" ? "Claro" : m === "dark" ? "Escuro" : "Auto";
            const selected = a.mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => update({ mode: m })}
                className={`text-left rounded-lg border bg-card p-3 transition-all ${
                  selected ? "ring-2 ring-primary border-primary" : "hover:border-foreground/30"
                }`}
              >
                <ThemePreview variant={m} />
                <div className="text-sm font-medium mt-2">{label}</div>
              </button>
            );
          })}
        </div>
      </SectionRow>

      <Separator />

      <SectionRow title="Contraste" description="Ative e desative texto e bordas de alto contraste.">
        <Card><CardContent className="p-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Alto contraste para maior acessibilidade</div>
            <p className="text-xs text-muted-foreground">
              Aumenta a espessura de bordas e o peso da tipografia.
            </p>
          </div>
          <Switch checked={a.highContrast} onCheckedChange={(v) => update({ highContrast: v })} />
        </CardContent></Card>
      </SectionRow>

      <Separator />

      <SectionRow title="Idioma e região" description="Personalize seu idioma e região.">
        <Card><CardContent className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Idioma</Label>
            <Select value={a.language} onValueChange={(v) => update({ language: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">🌐 Português (Brasil)</SelectItem>
                <SelectItem value="en" disabled>English (em breve)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fuso horário</Label>
            <Select value={a.timezone} onValueChange={(v) => update({ timezone: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="notify-tz"
              checked={a.notifyTzChange}
              onCheckedChange={(v) => update({ notifyTzChange: Boolean(v) })}
            />
            <Label htmlFor="notify-tz" className="text-sm font-normal cursor-pointer">
              Notifique-me de alterações no fuso horário
            </Label>
          </div>
        </CardContent></Card>
      </SectionRow>

      <Separator />

      <SectionRow
        title="Formato de data e hora"
        description="Escolha como os dados de hora e data são exibidos."
      >
        <Card><CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <Label>Início da semana no calendário</Label>
            <RadioGroup
              value={a.weekStart}
              onValueChange={(v) => update({ weekStart: v as WeekStart })}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ws-sun" value="sunday" />
                <Label htmlFor="ws-sun" className="font-normal cursor-pointer">Domingo</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ws-mon" value="monday" />
                <Label htmlFor="ws-mon" className="font-normal cursor-pointer">Segunda-feira</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Formato da hora</Label>
            <RadioGroup
              value={a.timeFormat}
              onValueChange={(v) => update({ timeFormat: v as TimeFormat })}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="tf-24" value="24h" />
                <Label htmlFor="tf-24" className="font-normal cursor-pointer">24 horas</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="tf-12" value="12h" />
                <Label htmlFor="tf-12" className="font-normal cursor-pointer">12 horas</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Formato da data</Label>
            <RadioGroup
              value={a.dateFormat}
              onValueChange={(v) => update({ dateFormat: v as DateFormat })}
              className="flex flex-col gap-2"
            >
              {(["mm/dd/yyyy", "dd/mm/yyyy", "yyyy/mm/dd"] as DateFormat[]).map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <RadioGroupItem id={`df-${f}`} value={f} />
                  <Label htmlFor={`df-${f}`} className="font-normal cursor-pointer font-mono">{f}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </CardContent></Card>
      </SectionRow>
    </div>
  );
}
