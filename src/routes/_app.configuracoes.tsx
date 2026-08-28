import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Trash2,
  UserPlus,
  User as UserIcon,
  Mail,
  Lock,
  Search,
  KeyRound,
  Loader2,
  ImageIcon,
  X,
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listForms } from "@/lib/forms-store";
import {
  loadAppearance,
  saveAppearance,
  applyAppearance,
  type Appearance,
  type ThemeMode,
  type WeekStart,
  type TimeFormat,
  type DateFormat,
} from "@/lib/appearance";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/authHeader";
import { getClinicBranding, uploadClinicLogo, removeClinicLogo } from "@/lib/clinicBranding";
import { ClinicLogo } from "@/components/ClinicLogo";
import { toast } from "sonner";
import type { Role, User } from "@/types";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/configuracoes")({ component: SettingsPage });

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  psicologo: "Psicólogo",
  psiquiatra: "Psiquiatra",
  recepcionista: "Recepcionista",
  // Aliases em inglês (dados do mock) mapeados para os mesmos rótulos.
  psychologist: "Psicólogo",
  psychiatrist: "Psiquiatra",
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-primary/15 text-primary border-primary/30",
  psicologo: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  psychologist: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  psiquiatra: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  psychiatrist: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  recepcionista: "bg-muted text-muted-foreground border-border",
};

const LS = {
  defaultForm: "mh.settings.defaultForm",
  notifications: "mh.settings.notifications",
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
        </TabsList>

        {user?.role === "admin" && (
          <TabsContent value="geral" className="space-y-6">
            <BrandingCard />
            <TeamCard />
            <DefaultFormCard />
            <NotificationsCard />
          </TabsContent>
        )}

        {user?.role === "admin" && (
          <TabsContent value="integracoes" className="space-y-6">
            <ReminderTemplateCard />
          </TabsContent>
        )}

        <TabsContent value="perfil">
          <ProfileTab />
          <div className="mt-8">
            <AppearanceTab />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================== MARCA / LOGO ============================== */

function BrandingCard() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { data: branding, isLoading } = useQuery({
    queryKey: ["clinic-branding"],
    queryFn: getClinicBranding,
  });

  const upload = useMutation({
    mutationFn: uploadClinicLogo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-branding"] });
      toast.success("Logo atualizada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar a logo"),
  });

  const remove = useMutation({
    mutationFn: removeClinicLogo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-branding"] });
      toast.success("Logo removida");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover a logo"),
  });

  function handleFile(file: File | null) {
    if (!file) return;
    setPreviewError(null);
    upload.mutate(file, {
      onError: (e) => setPreviewError(e instanceof Error ? e.message : "Erro ao enviar a logo"),
    });
  }

  return (
    <SectionRow
      title="Marca"
      description="Logo exibida na barra lateral, na tela de login e no formulário público enviado aos pacientes."
    >
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            {isLoading ? (
              <div className="h-16 w-16 rounded-lg border flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ClinicLogo className="h-16 w-16 rounded-lg border" />
            )}
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={upload.isPending}
                >
                  {upload.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4 mr-2" />
                  )}
                  {branding?.logoUrl ? "Trocar logo" : "Enviar logo"}
                </Button>
                {branding?.logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                  >
                    {remove.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <X className="h-4 w-4 mr-2" />
                    )}
                    Remover
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                PNG, JPG, SVG ou WEBP · máximo 2MB. Fica visível publicamente (login e formulário
                do paciente), então evite imagens com dados sensíveis.
              </p>
              {previewError && <p className="text-xs text-danger">{previewError}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    </SectionRow>
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

  const [name, setName] = useState<string>(user?.name || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  async function save() {
    if (password || confirm) {
      if (password !== confirm) {
        toast.error("As senhas não coincidem");
        return;
      }
      if (password.length < 6) {
        toast.error("A senha deve ter ao menos 6 caracteres");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    if (user?.id) {
      const { error } = (await supabase.from("profiles").update({ name }).eq("id", user.id)) as any;
      if (error) {
        toast.error(error.message);
        return;
      }
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
  const { user: me } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    role: "psicologo" as Role,
    password: "",
  });
  const [editForm, setEditForm] = useState({ name: "", role: "psicologo" as Role });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = (await supabase.from("profiles").select("*")) as any;
      if (error) throw error;
      return data as User[];
    },
  });

  // As três mutations abaixo chamam api/create-user.ts, api/update-user.ts e
  // api/delete-user.ts, que agora exigem o header Authorization com o token da
  // sessão atual (ver api/_lib/requireAdmin.ts) — sem isso, todas retornam 401.
  const createUser = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setAddOpen(false);
      toast.success("Membro adicionado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const updateUser = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const res = await fetch("/api/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ id: editing.id, name: editForm.name, role: editForm.role }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditing(null);
      toast.success("Membro atualizado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const removeUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Membro removido");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover"),
  });

  async function sendReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) toast.error(error.message);
    else toast.success("E-mail de redefinição de senha enviado");
  }

  function handleAdd() {
    if (!addForm.name || !addForm.email || !addForm.password) {
      toast.error("Preencha nome, e-mail e senha");
      return;
    }
    if (addForm.password.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    createUser.mutate();
  }

  function openEdit(u: User) {
    setEditForm({ name: u.name, role: u.role });
    setEditing(u);
  }

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(q.toLowerCase()) ||
      u.email.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <SectionRow title="Equipe" description="Profissionais com acesso ao sistema.">
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome ou e-mail…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button
              className="shrink-0"
              onClick={() => {
                setAddForm({ name: "", email: "", role: "psicologo", password: "" });
                setAddOpen(true);
              }}
            >
              <UserPlus className="h-4 w-4 mr-2" /> Adicionar membro
            </Button>
          </div>

          <div className="divide-y rounded-md border">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center">
                Nenhum membro encontrado.
              </p>
            )}
            {filtered.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <div key={u.id} className="flex items-center gap-3 p-3">
                  <div
                    className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                    style={{ background: colorFromName(u.name) }}
                  >
                    {initialsOf(u.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{u.name}</span>
                      {isMe && (
                        <Badge variant="secondary" className="shrink-0">
                          Você
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0", ROLE_BADGE[u.role])}>
                    {ROLE_LABEL[u.role]}
                  </Badge>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Enviar redefinição de senha"
                      onClick={() => sendReset(u.email)}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Editar" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!isMe && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" title="Remover">
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover {u.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Isso apaga a conta de login e o acesso deste membro. Ação
                              irreversível.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeUser.mutate(u.id)}>
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{users.length} membro(s)</p>
        </CardContent>
      </Card>

      {/* Adicionar membro */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select
                value={addForm.role}
                onValueChange={(v) => setAddForm({ ...addForm, role: v as Role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Input
                type="password"
                placeholder="mín. 6 caracteres"
                value={addForm.password}
                onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={createUser.isPending}>
              {createUser.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar membro */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm({ ...editForm, role: v as Role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="psicologo">Psicólogo</SelectItem>
                  <SelectItem value="psiquiatra">Psiquiatra</SelectItem>
                  <SelectItem value="recepcionista">Recepcionista</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editing?.id === me?.id && me?.role === "admin" && editForm.role !== "admin" && (
              <p className="text-xs text-amber-500">
                Atenção: você está removendo seu próprio acesso de administrador.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => updateUser.mutate()}
              disabled={updateUser.isPending || !editForm.name.trim()}
            >
              {updateUser.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionRow>
  );
}

/* ========================= FORMULÁRIO PADRÃO ========================= */

function DefaultFormCard() {
  const qc = useQueryClient();
  const { data: forms = [] } = useQuery({ queryKey: ["forms"], queryFn: listForms });
  const activeForms = forms.filter((f) => f.status === "active");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = (await supabase
        .from("app_settings")
        .select("default_form_id")
        .eq("id", true)
        .maybeSingle()) as any;
      if (error) throw error;
      return { defaultFormId: data?.default_form_id as string | null };
    },
  });

  const [selected, setSelected] = useState<string>("");
  useEffect(() => {
    if (settings?.defaultFormId) setSelected(settings.defaultFormId);
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .update({ default_form_id: selected })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Formulário padrão salvo");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  return (
    <SectionRow
      title="Formulário padrão"
      description="Formulário enviado a pacientes sem um formulário específico atribuído."
    >
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="space-y-1.5">
            <Label>Formulário ativo</Label>
            <Select value={selected} onValueChange={setSelected} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    activeForms.length ? "Selecione um formulário" : "Nenhum formulário ativo cadastrado"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {activeForms.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cadastre e edite formulários em <span className="font-medium">Formulários</span>. Um
              paciente específico pode receber um formulário diferente deste (ver cadastro do
              paciente).
            </p>
          </div>
          <Button onClick={() => save.mutate()} disabled={!selected || save.isPending}>
            Salvar
          </Button>
        </CardContent>
      </Card>
    </SectionRow>
  );
}

/* ============================ NOTIFICAÇÕES ============================ */

type NotificationPrefs = { inactivity2d: boolean; redStatus: boolean };

function NotificationsCard() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
    readLS<NotificationPrefs>(LS.notifications, { inactivity2d: true, redStatus: true }),
  );
  useEffect(() => {
    writeLS(LS.notifications, prefs);
  }, [prefs]);

  return (
    <SectionRow title="Notificações" description="Alertas automáticos por e-mail para a equipe.">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Inatividade do paciente</div>
              <p className="text-xs text-muted-foreground">
                Notifica a equipe quando um paciente não responde há 2 dias ou mais.
              </p>
            </div>
            <Switch
              checked={prefs.inactivity2d}
              onCheckedChange={(v) => setPrefs({ ...prefs, inactivity2d: v })}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Status crítico (vermelho)</div>
              <p className="text-xs text-muted-foreground">
                Notifica quando um paciente entra em status vermelho.
              </p>
            </div>
            <Switch
              checked={prefs.redStatus}
              onCheckedChange={(v) => setPrefs({ ...prefs, redStatus: v })}
            />
          </div>
        </CardContent>
      </Card>
    </SectionRow>
  );
}

/* ============================== LEMBRETE (n8n) ============================== */
/*
 * O envio em si é feito pelo n8n (que fala com o Chakra HQ / WhatsApp) — este
 * app não guarda credencial nenhuma de WhatsApp. Só o TEXTO do template fica
 * aqui, editável pela equipe, e é renderizado (com {{name}}/{{link}}
 * substituídos) por api/messages/send-form.ts antes de acionar o n8n.
 */

function ReminderTemplateCard() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["app-settings-reminder"],
    queryFn: async () => {
      const { data, error } = (await supabase
        .from("app_settings")
        .select("reminder_message_template")
        .eq("id", true)
        .maybeSingle()) as any;
      if (error) throw error;
      return { template: (data?.reminder_message_template as string) ?? "" };
    },
  });

  const [tpl, setTpl] = useState("");
  useEffect(() => {
    if (settings) setTpl(settings.template);
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .update({ reminder_message_template: tpl })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings-reminder"] });
      toast.success("Template salvo");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  return (
    <SectionRow
      title="Mensagem de lembrete"
      description="Texto enviado aos pacientes ao disparar o formulário (via n8n)."
    >
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="space-y-1.5">
            <Label>Template da mensagem</Label>
            <Textarea rows={4} value={tpl} onChange={(e) => setTpl(e.target.value)} disabled={isLoading} />
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: <code>{"{{name}}"}</code> (primeiro nome do paciente),{" "}
              <code>{"{{link}}"}</code> (link do formulário).
            </p>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
            Salvar
          </Button>
        </CardContent>
      </Card>
    </SectionRow>
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
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
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
          <clipPath id="left">
            <rect x="0" y="0" width="60" height="80" />
          </clipPath>
          <clipPath id="right">
            <rect x="60" y="0" width="60" height="80" />
          </clipPath>
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

      <SectionRow
        title="Contraste"
        description="Ative e desative texto e bordas de alto contraste."
      >
        <Card>
          <CardContent className="p-6 flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Alto contraste para maior acessibilidade</div>
              <p className="text-xs text-muted-foreground">
                Aumenta a espessura de bordas e o peso da tipografia.
              </p>
            </div>
            <Switch checked={a.highContrast} onCheckedChange={(v) => update({ highContrast: v })} />
          </CardContent>
        </Card>
      </SectionRow>

      <Separator />

      <SectionRow title="Idioma e região" description="Personalize seu idioma e região.">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label>Idioma</Label>
              <Select value={a.language} onValueChange={(v) => update({ language: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">🌐 Português (Brasil)</SelectItem>
                  <SelectItem value="en" disabled>
                    English (em breve)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fuso horário</Label>
              <Select value={a.timezone} onValueChange={(v) => update({ timezone: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
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
          </CardContent>
        </Card>
      </SectionRow>

      <Separator />

      <SectionRow
        title="Formato de data e hora"
        description="Escolha como os dados de hora e data são exibidos."
      >
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="space-y-2">
              <Label>Início da semana no calendário</Label>
              <RadioGroup
                value={a.weekStart}
                onValueChange={(v) => update({ weekStart: v as WeekStart })}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="ws-sun" value="sunday" />
                  <Label htmlFor="ws-sun" className="font-normal cursor-pointer">
                    Domingo
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="ws-mon" value="monday" />
                  <Label htmlFor="ws-mon" className="font-normal cursor-pointer">
                    Segunda-feira
                  </Label>
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
                  <Label htmlFor="tf-24" className="font-normal cursor-pointer">
                    24 horas
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="tf-12" value="12h" />
                  <Label htmlFor="tf-12" className="font-normal cursor-pointer">
                    12 horas
                  </Label>
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
                    <Label htmlFor={`df-${f}`} className="font-normal cursor-pointer font-mono">
                      {f}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </CardContent>
        </Card>
      </SectionRow>
    </div>
  );
}