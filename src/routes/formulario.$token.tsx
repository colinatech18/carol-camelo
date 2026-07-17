import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FORM_QUESTIONS } from "@/lib/formQuestions";
import { toast } from "sonner";

export const Route = createFileRoute("/formulario/$token")({ component: PublicForm });

interface PublicPatient {
  patientId: string;
  name: string;
  programDay: number;
}

async function fetchPublicPatient(token: string): Promise<PublicPatient> {
  const res = await fetch(`/api/forms/get-by-token?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(res.status === 404 ? "not_found" : "load_error");
  return (await res.json()) as PublicPatient;
}

function PublicForm() {
  const { token } = Route.useParams();
  const {
    data: patient,
    isLoading: pLoading,
    error,
  } = useQuery({
    queryKey: ["public-patient", token],
    queryFn: () => fetchPublicPatient(token),
    retry: false,
  });

  const [answers, setAnswers] = useState<Record<string, { value: number; note: string }>>({});
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const entries = FORM_QUESTIONS.map((q) => ({
        questionId: q.id,
        value: answers[q.id]?.value ?? 0,
        note: answers[q.id]?.note?.trim() || undefined,
      }));
      if (entries.some((e) => !e.value)) throw new Error("Responda todas as perguntas");

      // patient_id nunca é enviado pelo cliente — o servidor o deriva do token.
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, answers: entries }),
      });
      if (res.status === 409) throw new Error("Você já enviou suas respostas hoje.");
      if (!res.ok) throw new Error("Erro ao enviar");
      return (await res.json()) as { ok: true };
    },
    onSuccess: () => {
      setDone(true);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar"),
  });

  if (pLoading) return <CenteredMessage>Carregando…</CenteredMessage>;
  if (error || !patient) return <CenteredMessage>Link inválido ou expirado.</CenteredMessage>;

  const day = patient.programDay;
  const firstName = patient.name.split(" ")[0];

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <div className="max-w-xl mx-auto p-6 space-y-6">
        <header className="flex items-center gap-2 pt-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Vera PSI</div>
            <div className="text-xs text-muted-foreground">Diário de evolução</div>
          </div>
        </header>

        <Card>
          <CardContent className="p-6 space-y-1">
            <p className="text-sm text-muted-foreground">Olá, {firstName} 👋</p>
            <h1 className="text-xl font-semibold">Dia {day} de 30</h1>
            <p className="text-sm text-muted-foreground">
              Como você está hoje? Leva uns 2 minutinhos.
            </p>
          </CardContent>
        </Card>

        {FORM_QUESTIONS.map((q) => {
          const cur = answers[q.id] ?? { value: 0, note: "" };
          return (
            <Card key={q.id}>
              <CardContent className="p-6 space-y-3">
                <h3 className="text-sm font-medium">{q.text}</h3>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: { ...cur, value: n } }))}
                      className={`rounded-md border py-3 text-sm font-medium transition ${cur.value === n ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Muito ruim</span>
                  <span>Muito bom</span>
                </div>
                <Textarea
                  rows={2}
                  placeholder="Quer comentar algo? (opcional)"
                  value={cur.note}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [q.id]: { ...cur, note: e.target.value } }))
                  }
                />
              </CardContent>
            </Card>
          );
        })}

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

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-muted-foreground">
      {children}
    </div>
  );
}
