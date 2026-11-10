import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClinicLogo } from "@/components/ClinicLogo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { brasiliaDateString } from "@/lib/criticality";
import {
  FieldBlock,
  CenteredMessage,
  isAnswerable,
  isEmpty,
  type FormField,
} from "@/components/PublicFormFields";

export const Route = createFileRoute("/formulario/$token")({ component: PublicForm });

interface PublicFormDef {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
}

interface OpenDay {
  date: string;
  programDay: number;
}

interface PublicPatient {
  patientId: string;
  name: string;
  programDay: number;
  openDays: OpenDay[];
  form: PublicFormDef;
}

/** "Hoje" / "Ontem" / "dd/mm" — por comparação de string, não de Date, pra não
 * reintroduzir um cálculo de fuso horário no cliente. */
function dayLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return "Hoje";
  const [y, m, d] = todayStr.split("-").map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1));
  const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterday.getUTCDate()).padStart(2, "0")}`;
  if (dateStr === yesterdayStr) return "Ontem";
  const [, mm, dd] = dateStr.split("-");
  return `${dd}/${mm}`;
}

async function fetchPublicPatient(token: string): Promise<PublicPatient> {
  const res = await fetch(`/api/forms/get-by-token?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.error === "no_form_configured" || body.error === "form_unavailable") {
      throw new Error("form_unavailable");
    }
    throw new Error(res.status === 404 ? "not_found" : "load_error");
  }
  return (await res.json()) as PublicPatient;
}

function PublicForm() {
  const { token } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-patient", token],
    queryFn: () => fetchPublicPatient(token),
    retry: false,
  });

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    // Seleciona o dia mais recente em aberto por padrão (hoje, se ainda não
    // respondido; senão o dia faltante mais recente).
    if (data && data.openDays.length > 0 && selectedDay === null) {
      setSelectedDay(data.openDays[data.openDays.length - 1].date);
    }
  }, [data, selectedDay]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Formulário não carregado");
      if (!selectedDay) throw new Error("Selecione o dia que está respondendo");
      const answerable = data.form.fields.filter((f) => isAnswerable(f.type));

      for (const f of answerable) {
        if (f.required && isEmpty(values[f.id])) {
          throw new Error(`Responda: ${f.label}`);
        }
      }

      const entries = answerable
        .map((f) => {
          const v = values[f.id];
          if (isEmpty(v)) return null;
          const note = notes[f.id]?.trim();
          return { questionId: f.id, value: v, ...(note ? { note } : {}) };
        })
        .filter((e): e is { questionId: string; value: unknown; note?: string } => e !== null);

      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, answers: entries, answerDate: selectedDay }),
      });
      if (res.status === 409) throw new Error("Você já enviou as respostas desse dia.");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Erro ao enviar");
      }
      return (await res.json()) as { ok: true };
    },
    onSuccess: () => setDone(true),
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      setFormError(msg);
      toast.error(msg);
    },
  });

  if (isLoading) return <CenteredMessage>Carregando…</CenteredMessage>;
  if (error || !data) {
    const msg = error instanceof Error ? error.message : "load_error";
    return (
      <CenteredMessage>
        {msg === "form_unavailable"
          ? "Nenhum formulário disponível no momento. Fale com sua equipe clínica."
          : "Link inválido ou expirado."}
      </CenteredMessage>
    );
  }

  const { name, form, openDays } = data;
  const firstName = name.split(" ")[0];
  const todayStr = brasiliaDateString();
  const selected = openDays.find((d) => d.date === selectedDay) ?? null;
  const programDay = selected?.programDay ?? data.programDay;

  if (openDays.length === 0 && !done) {
    return (
      <CenteredMessage>
        <div className="text-center space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success-foreground">
            <Check className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold">Tudo em dia, {firstName}!</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Você já respondeu o diário dos últimos dias. Volte amanhã pra continuar.
          </p>
        </div>
      </CenteredMessage>
    );
  }

  if (done)
    return (
      <CenteredMessage>
        <div className="text-center space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success-foreground">
            <Check className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold">Resposta enviada!</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Obrigado, {firstName}. Sua equipe clínica já recebeu suas respostas.
          </p>
        </div>
      </CenteredMessage>
    );

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
            <div className="text-xs text-muted-foreground">Diário de evolução</div>
          </div>
        </header>

        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Olá, {firstName} 👋</p>
              <h1 className="text-xl font-semibold">Dia {programDay} de 30</h1>
              {form.description && (
                <p className="text-sm text-muted-foreground">{form.description}</p>
              )}
            </div>

            {openDays.length > 1 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs text-muted-foreground">
                  Você ainda não respondeu em {openDays.length} dias. Escolha qual está preenchendo:
                </p>
                <div className="flex flex-wrap gap-2">
                  {openDays.map((d) => (
                    <button
                      type="button"
                      key={d.date}
                      onClick={() => setSelectedDay(d.date)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        d.date === selectedDay
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted",
                      )}
                    >
                      {dayLabel(d.date, todayStr)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {form.fields.map((f) => (
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
          className="w-full"
          size="lg"
          onClick={() => submit.mutate()}
          disabled={submit.isPending}
        >
          {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar respostas
        </Button>
      </div>
    </div>
  );
}
