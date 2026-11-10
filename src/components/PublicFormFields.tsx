/**
 * Renderização de campos de formulário no link público (sem sessão), extraída
 * de `formulario.$token.tsx` pra ser reaproveitada pelo link público de
 * Atividades (`atividades.$token.tsx`) — mesmo conjunto de tipos de pergunta,
 * duas telas públicas diferentes.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FieldType =
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

export interface FieldOption {
  id: string;
  label: string;
}

export interface FormField {
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

export function isAnswerable(type: FieldType) {
  return type !== "section" && type !== "instruction";
}

export function isEmpty(v: unknown) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

export function FieldBlock({
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
        {field.description && (
          <p className="text-sm text-muted-foreground mt-1">{field.description}</p>
        )}
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

export function FieldInput({
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
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
          >
            {options.map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => onChange(n)}
                className={cn(
                  "rounded-md border py-3 text-sm font-medium transition",
                  value === n
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted",
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
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${opts.length || 5}, minmax(0,1fr))` }}
        >
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
      return (
        <Input
          type="time"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
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

export function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-muted-foreground text-center">
      {children}
    </div>
  );
}
