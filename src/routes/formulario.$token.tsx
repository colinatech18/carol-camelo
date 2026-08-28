import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClinicLogo } from "@/components/ClinicLogo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/formulario/$token")({ component: PublicForm });

type FieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "date"
  | "time"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "scale"
  | "emoji_scale"
  | "money"
  | "url"
  | "section"
  | "instruction";

interface FieldOption {
  id: string;
  label: string;
}

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  required?: boolean;
  allowComment?: boolean;
  placeholder?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  currency?: string;
  minLabel?: string;
  maxLabel?: string;
  showNumbers?: boolean;
  options?: FieldOption[];
  maxSelections?: number;
  dateMin?: string;
  dateMax?: string;
}

interface PublicFormDef {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
}

interface PublicPatient {
  patientId: string;
  name: string;
  programDay: number;
  form: PublicFormDef;
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

function isAnswerable(type: FieldType) {
  return type !== "section" && type !== "instruction";
}

function isEmpty(v: unknown) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
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

  const submit = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Formulário não carregado");
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
        body: JSON.stringify({ token, answers: entries }),
      });
      if (res.status === 409) throw new Error("Você já enviou suas respostas hoje.");
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

  const { name, programDay, form } = data;
  const firstName = name.split(" ")[0];

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
          <CardContent className="p-6 space-y-1">
            <p className="text-sm text-muted-foreground">Olá, {firstName} 👋</p>
            <h1 className="text-xl font-semibold">Dia {programDay} de 30</h1>
            {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
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

        <Button className="w-full" size="lg" onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar respostas
        </Button>
      </div>
    </div>
  );
}

function FieldBlock({
  field,
  value,
  note,
  onChange,
  onNoteChange,
}: {
  field: FormField;
  value: unknown;
  note: string;
  onChange: (v: unknown) => void;
  onNoteChange: (n: string) => void;
}) {
  if (field.type === "section") {
    return (
      <div className="pt-2">
        <h2 className="text-base font-semibold">{field.label}</h2>
        {field.description && <p className="text-sm text-muted-foreground mt-1">{field.description}</p>}
      </div>
    );
  }
  if (field.type === "instruction") {
    return (
      <Card className="bg-muted/40 border-dashed">
        <CardContent className="p-4 text-sm text-muted-foreground">{field.label}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <h3 className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-danger"> *</span>}
        </h3>
        {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}

        <FieldInput field={field} value={value} onChange={onChange} />

        {field.allowComment && (
          <Textarea
            rows={2}
            placeholder="Quer comentar algo? (opcional)"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case "scale": {
      const min = field.min ?? 1;
      const max = field.max ?? 5;
      const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div className="space-y-2">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
            {options.map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => onChange(n)}
                className={cn(
                  "rounded-md border py-3 text-sm font-medium transition",
                  value === n ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
                )}
              >
                {field.showNumbers === false ? "" : n}
              </button>
            ))}
          </div>
          {(field.minLabel || field.maxLabel) && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{field.minLabel}</span>
              <span>{field.maxLabel}</span>
            </div>
          )}
        </div>
      );
    }
    case "emoji_scale": {
      const opts = field.options ?? [];
      return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${opts.length || 5}, minmax(0,1fr))` }}>
          {opts.map((o, idx) => (
            <button
              type="button"
              key={o.id}
              onClick={() => onChange(idx + 1)}
              className={cn(
                "rounded-md border py-3 text-xl transition",
                value === idx + 1 ? "bg-primary/10 border-primary" : "bg-background hover:bg-muted",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    }
    case "short_text":
      return (
        <Input
          value={(value as string) ?? ""}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "long_text":
      return (
        <Textarea
          rows={3}
          value={(value as string) ?? ""}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={(value as number) ?? ""}
          min={field.min}
          max={field.max}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
    case "money":
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {field.currency ?? "BRL"}
          </span>
          <Input
            type="number"
            className="pl-14"
            value={(value as number) ?? ""}
            min={0}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </div>
      );
    case "url":
      return (
        <Input
          type="url"
          placeholder="https://…"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={(value as string) ?? ""}
          min={field.dateMin}
          max={field.dateMax}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "time":
      return <Input type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "radio":
      return (
        <RadioGroup value={(value as string) ?? ""} onValueChange={onChange} className="space-y-2">
          {(field.options ?? []).map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <RadioGroupItem id={`${field.id}-${o.id}`} value={o.id} />
              <Label htmlFor={`${field.id}-${o.id}`} className="font-normal cursor-pointer">
                {o.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    case "dropdown":
      return (
        <Select value={(value as string) ?? ""} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "checkbox": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2">
          {(field.options ?? []).map((o) => {
            const checked = selected.includes(o.id);
            return (
              <div key={o.id} className="flex items-center gap-2">
                <Checkbox
                  id={`${field.id}-${o.id}`}
                  checked={checked}
                  onCheckedChange={(v) => {
                    const next = v ? [...selected, o.id] : selected.filter((s) => s !== o.id);
                    if (field.maxSelections && next.length > field.maxSelections) return;
                    onChange(next);
                  }}
                />
                <Label htmlFor={`${field.id}-${o.id}`} className="font-normal cursor-pointer">
                  {o.label}
                </Label>
              </div>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-muted-foreground text-center">
      {children}
    </div>
  );
}