import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/services/api";
import { programDay } from "@/lib/criticality";
import { toast } from "sonner";

export const Route = createFileRoute("/formulario/$token")({ component: PublicForm });

function PublicForm() {
  const { token } = Route.useParams();
  const { data: patient, isLoading: pLoading, error } = useQuery({ queryKey: ["public-patient", token], queryFn: () => api.patients.getByToken(token), retry: false });
  const { data: questions = [] } = useQuery({ queryKey: ["questions"], queryFn: api.forms.getQuestions });

  const [answers, setAnswers] = useState<Record<string, { value: number; note: string }>>({});
  const [done, setDone] = useState(false);

  const day = useMemo(() => (patient ? programDay(patient.startDate) : 0), [patient]);

  const submit = useMutation({
    mutationFn: () => {
      if (!patient) throw new Error("Paciente inválido");
      const entries = questions.map((q) => ({
        questionId: q.id,
        value: answers[q.id]?.value ?? 0,
        note: answers[q.id]?.note || undefined,
      }));
      if (entries.some((e) => !e.value)) throw new Error("Responda todas as perguntas");
      return api.forms.saveResponse({
        patientId: patient.id,
        date: new Date().toISOString().slice(0, 10),
        programDay: day,
        answers: entries,
      });
    },
    onSuccess: () => { setDone(true); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar"),
  });

  if (pLoading) return <CenteredMessage>Carregando…</CenteredMessage>;
  if (error || !patient) return <CenteredMessage>Link inválido ou expirado.</CenteredMessage>;

  if (done) return (
    <CenteredMessage>
      <div className="text-center space-y-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success-foreground"><Check className="h-6 w-6" /></div>
        <h2 className="text-xl font-semibold">Resposta enviada!</h2>
        <p className="text-sm text-muted-foreground max-w-xs">Obrigado, {patient.name.split(" ")[0]}. Sua equipe clínica já recebeu suas respostas.</p>
      </div>
    </CenteredMessage>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <div className="max-w-xl mx-auto p-6 space-y-6">
        <header className="flex items-center gap-2 pt-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Brain className="h-5 w-5" /></div>
          <div>
            <div className="text-sm font-semibold">Vera PSI</div>
            <div className="text-xs text-muted-foreground">Diário de evolução</div>
          </div>
        </header>

        <Card>
          <CardContent className="p-6 space-y-1">
            <p className="text-sm text-muted-foreground">Olá, {patient.name.split(" ")[0]} 👋</p>
            <h1 className="text-xl font-semibold">Dia {day} de 30</h1>
            <p className="text-sm text-muted-foreground">Como você está hoje? Leva uns 2 minutinhos.</p>
          </CardContent>
        </Card>

        {questions.map((q) => {
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
                <div className="flex justify-between text-xs text-muted-foreground"><span>Muito ruim</span><span>Muito bom</span></div>
                <Textarea
                  rows={2}
                  placeholder="Quer comentar algo? (opcional)"
                  value={cur.note}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: { ...cur, note: e.target.value } }))}
                />
              </CardContent>
            </Card>
          );
        })}

        <Button className="w-full" size="lg" onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar respostas
        </Button>
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6 text-muted-foreground">{children}</div>;
}
