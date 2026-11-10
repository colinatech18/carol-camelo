import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClinicLogo } from "@/components/ClinicLogo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FieldBlock,
  CenteredMessage,
  isAnswerable,
  isEmpty,
  type FormField,
} from "@/components/PublicFormFields";

export const Route = createFileRoute("/atividades/$token")({ component: PublicActivities });

interface PublicActivity {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
  answered: boolean;
}

interface PublicActivitiesResponse {
  patientId: string;
  name: string;
  activities: PublicActivity[];
}

async function fetchActivities(token: string): Promise<PublicActivitiesResponse> {
  const res = await fetch(`/api/activities/get-by-token?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(res.status === 404 ? "not_found" : "load_error");
  return (await res.json()) as PublicActivitiesResponse;
}

function PublicActivities() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-activities", token],
    queryFn: () => fetchActivities(token),
    retry: false,
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async (activity: PublicActivity) => {
      const answerable = activity.fields.filter((f) => isAnswerable(f.type));
      for (const f of answerable) {
        if (f.required && isEmpty(values[f.id])) throw new Error(`Responda: ${f.label}`);
      }
      const entries = answerable
        .map((f) => {
          const v = values[f.id];
          if (isEmpty(v)) return null;
          const note = notes[f.id]?.trim();
          return { questionId: f.id, value: v, ...(note ? { note } : {}) };
        })
        .filter((e): e is { questionId: string; value: unknown; note?: string } => e !== null);

      const res = await fetch("/api/activities/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, activityId: activity.id, answers: entries }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao enviar");
      }
      return (await res.json()) as { ok: true };
    },
    onSuccess: () => {
      toast.success("Resposta enviada!");
      setOpenId(null);
      setValues({});
      setNotes({});
      qc.invalidateQueries({ queryKey: ["public-activities", token] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      setFormError(msg);
      toast.error(msg);
    },
  });

  if (isLoading) return <CenteredMessage>Carregando…</CenteredMessage>;
  if (error || !data) {
    return <CenteredMessage>Link inválido ou expirado.</CenteredMessage>;
  }

  const firstName = data.name.split(" ")[0];
  const open = data.activities.find((a) => a.id === openId) ?? null;

  function setValue(fieldId: string, value: unknown) {
    setValues((v) => ({ ...v, [fieldId]: value }));
  }
  function setNote(fieldId: string, note: string) {
    setNotes((n) => ({ ...n, [fieldId]: note }));
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <div className="max-w-xl mx-auto p-6 space-y-6">
        <header className="flex items-center gap-2 pt-4">
          <ClinicLogo className="h-9 w-9 rounded-lg bg-primary text-primary-foreground" />
          <div>
            <div className="text-sm font-semibold">Vera PSI</div>
            <div className="text-xs text-muted-foreground">Atividades</div>
          </div>
        </header>

        {!open && (
          <Card>
            <CardContent className="p-6 space-y-1">
              <p className="text-sm text-muted-foreground">Olá, {firstName} 👋</p>
              <h1 className="text-xl font-semibold">Suas atividades</h1>
            </CardContent>
          </Card>
        )}

        {!open && data.activities.length === 0 && (
          <CenteredMessage>
            <div className="text-center space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success-foreground">
                <ListChecks className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold">Nenhuma atividade no momento</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Quando sua equipe clínica enviar uma nova atividade, ela aparece aqui.
              </p>
            </div>
          </CenteredMessage>
        )}

        {!open &&
          data.activities.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setOpenId(a.id);
                setValues({});
                setNotes({});
                setFormError(null);
              }}
              className="w-full text-left"
            >
              <Card className="hover:border-primary/40 transition">
                <CardContent className="p-5 flex items-center gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      {a.answered && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-success/15 text-success-foreground border-success/30"
                        >
                          <Check className="h-3 w-3 mr-1" /> Respondida
                        </Badge>
                      )}
                    </div>
                    {a.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </button>
          ))}

        {open && (
          <>
            <Card>
              <CardContent className="p-6 space-y-1">
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ← Voltar para atividades
                </button>
                <h1 className="text-xl font-semibold">{open.name}</h1>
                {open.description && (
                  <p className="text-sm text-muted-foreground">{open.description}</p>
                )}
                {open.answered && (
                  <p className="text-xs text-muted-foreground">
                    Você já respondeu esta atividade. Enviar de novo substitui a resposta anterior.
                  </p>
                )}
              </CardContent>
            </Card>

            {open.fields.map((f) => (
              <FieldBlock
                key={f.id}
                field={f}
                value={values[f.id]}
                note={notes[f.id] ?? ""}
                onChange={(v) => setValue(f.id, v)}
                onNoteChange={(n) => setNote(f.id, n)}
              />
            ))}

            {formError && <p className="text-sm text-danger">{formError}</p>}

            <Button
              className={cn("w-full")}
              size="lg"
              onClick={() => submit.mutate(open)}
              disabled={submit.isPending}
            >
              {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar
              respostas
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
