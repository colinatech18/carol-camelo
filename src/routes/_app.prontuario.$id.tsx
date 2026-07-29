import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/prontuario/$id")({ component: PatientRecord });

type NoteType = "psicologica" | "psiquiatrica";

interface Note {
  id: string;
  patient_id: string;
  author_id: string;
  note_type: NoteType;
  content: string;
  created_at: string;
}

const TYPE_LABEL: Record<NoteType, string> = {
  psicologica: "Psicológica",
  psiquiatrica: "Psiquiátrica",
};
// Faixa colorida à esquerda de cada anotação, para distinguir a categoria de relance.
const TYPE_ACCENT: Record<NoteType, string> = {
  psicologica: "border-l-primary",
  psiquiatrica: "border-l-violet-500",
};

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

function PatientRecord() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: patient } = useQuery({
    queryKey: ["patient-header", id],
    queryFn: async () => {
      const { data, error } = (await supabase
        .from("patients")
        .select("id, name")
        .eq("id", id)
        .single()) as any;
      if (error) throw error;
      return data as { id: string; name: string };
    },
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["prontuario-notes", id],
    queryFn: async () => {
      const { data, error } = (await supabase
        .from("prontuario_notes")
        .select("*")
        .eq("patient_id", id)
        .order("created_at", { ascending: false })) as any;
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });

  // profiles é legível por qualquer autenticado (mesmo padrão da tela de detalhe do paciente),
  // então dá pra resolver o nome do autor de cada anotação.
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = (await supabase.from("profiles").select("id, name")) as any;
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const authorName = (aid: string) =>
    profiles.find((p) => p.id === aid)?.name ?? "Autor desconhecido";

  const [noteType, setNoteType] = useState<NoteType>("psicologica");
  const [content, setContent] = useState("");

  const addNote = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão inválida — faça login novamente");
      const text = content.trim();
      if (!text) throw new Error("Escreva o conteúdo da anotação");
      // author_id vem da sessão autenticada (auth.users.id), nunca de input do cliente.
      const { error } = await supabase.from("prontuario_notes").insert({
        patient_id: id,
        author_id: user.id,
        note_type: noteType,
        content: text,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setContent("");
      qc.invalidateQueries({ queryKey: ["prontuario-notes", id] });
      toast.success("Anotação registrada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar anotação"),
  });

  // notes já vêm em ordem decrescente de created_at; agrupa por dia preservando essa ordem
  // (dias mais recentes primeiro; dentro do dia, horários mais recentes primeiro), com as
  // duas categorias intercaladas por data/hora.
  const grouped = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const day = n.created_at.slice(0, 10);
      const list = map.get(day);
      if (list) list.push(n);
      else map.set(day, [n]);
    }
    return [...map.entries()];
  }, [notes]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto">
      <Link
        to="/pacientes/$id"
        params={{ id }}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao paciente
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prontuário</h1>
          <p className="text-sm text-muted-foreground">
            {patient ? patient.name : "Carregando…"} · anotações clínicas
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" /> Psicológica
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-500" /> Psiquiátrica
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova anotação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="psicologica">Psicológica</SelectItem>
              <SelectItem value="psiquiatrica">Psiquiátrica</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            rows={4}
            placeholder="Escreva a anotação clínica…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button onClick={() => addNote.mutate()} disabled={addNote.isPending || !content.trim()}>
            {addNote.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar anotação
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma anotação registrada ainda.</p>
        )}
        {grouped.map(([day, dayNotes]) => (
          <div key={day} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground capitalize">
                {format(parseISO(day), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </h2>
              <div className="h-px flex-1 bg-border" />
            </div>
            {dayNotes.map((n) => {
              const author = authorName(n.author_id);
              return (
                <div
                  key={n.id}
                  className={cn("rounded-lg border bg-card p-4 space-y-2 border-l-4", TYPE_ACCENT[n.note_type])}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={n.note_type === "psicologica" ? "default" : "secondary"}>
                        {TYPE_LABEL[n.note_type]}
                      </Badge>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold", avatarColor(author))}>
                          {initials(author)}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{author}</span>
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(parseISO(n.created_at), "HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
