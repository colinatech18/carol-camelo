/**
 * Editor de perguntas (paleta de tipos + canvas + painel de configuração),
 * extraído de `_app.formularios.$id.edit.tsx` pra ser reaproveitado também
 * pelo editor de Atividades (_app.atividades.$id.edit.tsx) — mesma UX de
 * montar perguntas, independente de onde o conjunto de campos é usado depois.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { createField, FIELD_META, newId, type FormField, type FieldType } from "@/lib/forms-store";

const CATEGORIES: Array<{ id: "basic" | "choice" | "advanced" | "info"; label: string }> = [
  { id: "basic", label: "Básico" },
  { id: "choice", label: "Escolha" },
  { id: "advanced", label: "Avançado" },
  { id: "info", label: "Informativo" },
];

export function FormFieldsEditor({
  fields,
  onChange,
}: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const addField = (type: FieldType) => {
    const f = createField(type);
    onChange([...fields, f]);
    setSelectedId(f.id);
  };

  const updateField = (fid: string, patch: Partial<FormField>) => {
    onChange(fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)));
  };

  const removeField = (fid: string) => {
    onChange(fields.filter((f) => f.id !== fid));
    if (selectedId === fid) setSelectedId(null);
  };

  const move = (fid: string, dir: -1 | 1) => {
    const i = fields.findIndex((f) => f.id === fid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= fields.length) return;
    const copy = [...fields];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Palette */}
      <div className="lg:col-span-2 space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tipos de pergunta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {CATEGORIES.map((cat) => (
              <div key={cat.id}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {cat.label}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(FIELD_META) as [FieldType, (typeof FIELD_META)[FieldType]][])
                    .filter(([, m]) => m.category === cat.id)
                    .map(([type, m]) => (
                      <button
                        key={type}
                        onClick={() => addField(type)}
                        className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-sm text-left hover:bg-accent hover:border-primary/40 transition-colors"
                      >
                        <span className="text-base">{m.icon}</span>
                        <span className="truncate">{m.label}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Canvas */}
      <div className="lg:col-span-3 space-y-4">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Perguntas ({fields.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fields.length === 0 && (
              <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
                Clique em um tipo de pergunta à esquerda para adicionar.
              </div>
            )}
            {fields.map((f, idx) => {
              const meta = FIELD_META[f.type];
              const isSel = selectedId === f.id;
              return (
                <div
                  key={f.id}
                  className={`rounded-lg border transition-all ${isSel ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/40"}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(isSel ? null : f.id)}
                    className="w-full flex items-center gap-2 p-3 text-left"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground tabular-nums w-5">
                      {idx + 1}.
                    </span>
                    <span className="text-base">{meta.icon}</span>
                    <span className="flex-1 truncate text-sm font-medium">
                      {f.label || (
                        <span className="text-muted-foreground italic">Sem enunciado</span>
                      )}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {meta.label}
                    </Badge>
                    {f.required && (
                      <Badge
                        className="text-xs bg-danger/10 text-danger border-danger/30"
                        variant="outline"
                      >
                        *
                      </Badge>
                    )}
                    <div className="flex items-center gap-0.5 ml-1">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          move(f.id, -1);
                        }}
                        className="p-1 rounded hover:bg-accent cursor-pointer"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          move(f.id, 1);
                        }}
                        className="p-1 rounded hover:bg-accent cursor-pointer"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          removeField(f.id);
                        }}
                        className="p-1 rounded hover:bg-danger/10 text-danger cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </button>
                  {isSel && (
                    <div className="border-t p-4 bg-muted/30">
                      <FieldConfig
                        field={f}
                        onChange={(p) => updateField(f.id, p)}
                        onClose={() => setSelectedId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FieldConfig({
  field,
  onChange,
  onClose,
}: {
  field: FormField;
  onChange: (p: Partial<FormField>) => void;
  onClose: () => void;
}) {
  const t = field.type;
  const isInfo = t === "section" || t === "instruction";

  const setOptions = (next: NonNullable<FormField["options"]>) => onChange({ options: next });
  const addOption = () =>
    setOptions([
      ...(field.options ?? []),
      { id: newId(), label: `Opção ${(field.options?.length ?? 0) + 1}` },
    ]);
  const updateOption = (oid: string, label: string) =>
    setOptions((field.options ?? []).map((o) => (o.id === oid ? { ...o, label } : o)));
  const removeOption = (oid: string) =>
    setOptions((field.options ?? []).filter((o) => o.id !== oid));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Configurar pergunta</div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2 space-y-1.5">
          <Label className="text-xs">{isInfo ? "Texto" : "Enunciado"}</Label>
          <Input value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
        </div>

        {!isInfo && (
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs">Descrição / instrução auxiliar</Label>
            <Textarea
              value={field.description ?? ""}
              onChange={(e) => onChange({ description: e.target.value })}
              className="min-h-[60px]"
            />
          </div>
        )}

        {!isInfo && (
          <>
            <ToggleRow
              label="Obrigatório"
              checked={!!field.required}
              onChange={(v) => onChange({ required: v })}
            />
            <ToggleRow
              label="Permitir comentário adicional"
              checked={!!field.allowComment}
              onChange={(v) => onChange({ allowComment: v })}
            />
          </>
        )}
      </div>

      {(t === "short_text" || t === "long_text") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Placeholder">
            <Input
              value={field.placeholder ?? ""}
              onChange={(e) => onChange({ placeholder: e.target.value })}
            />
          </Field>
          <Field label="Limite de caracteres">
            <Input
              type="number"
              value={field.maxLength ?? ""}
              onChange={(e) =>
                onChange({ maxLength: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </Field>
        </div>
      )}

      {t === "number" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Mínimo">
            <Input
              type="number"
              value={field.min ?? ""}
              onChange={(e) =>
                onChange({ min: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </Field>
          <Field label="Máximo">
            <Input
              type="number"
              value={field.max ?? ""}
              onChange={(e) =>
                onChange({ max: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </Field>
          <Field label="Unidade">
            <Input
              value={field.unit ?? ""}
              onChange={(e) => onChange({ unit: e.target.value })}
              placeholder="kg, cm, h"
            />
          </Field>
        </div>
      )}

      {t === "scale" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Mínimo">
            <Input
              type="number"
              value={field.min ?? 1}
              onChange={(e) => onChange({ min: Number(e.target.value) })}
            />
          </Field>
          <Field label="Máximo">
            <Input
              type="number"
              value={field.max ?? 5}
              onChange={(e) => onChange({ max: Number(e.target.value) })}
            />
          </Field>
          <Field label="Label do mínimo">
            <Input
              value={field.minLabel ?? ""}
              onChange={(e) => onChange({ minLabel: e.target.value })}
            />
          </Field>
          <Field label="Label do máximo">
            <Input
              value={field.maxLabel ?? ""}
              onChange={(e) => onChange({ maxLabel: e.target.value })}
            />
          </Field>
          <ToggleRow
            label="Exibir números"
            checked={field.showNumbers !== false}
            onChange={(v) => onChange({ showNumbers: v })}
          />
        </div>
      )}

      {(t === "radio" || t === "checkbox" || t === "dropdown" || t === "emoji_scale") && (
        <div className="space-y-2">
          <Label className="text-xs">Opções</Label>
          <div className="space-y-1.5">
            {(field.options ?? []).map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <Input value={o.label} onChange={(e) => updateOption(o.id, e.target.value)} />
                <Button variant="ghost" size="icon" onClick={() => removeOption(o.id)}>
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addOption}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar opção
          </Button>
          {(t === "radio" || t === "checkbox" || t === "dropdown") && (
            <ToggleRow
              label='Opção "Outro (especificar)"'
              checked={!!field.allowOther}
              onChange={(v) => onChange({ allowOther: v })}
            />
          )}
          {t === "checkbox" && (
            <Field label="Máximo de seleções">
              <Input
                type="number"
                value={field.maxSelections ?? ""}
                onChange={(e) =>
                  onChange({ maxSelections: e.target.value ? Number(e.target.value) : undefined })
                }
              />
            </Field>
          )}
        </div>
      )}

      {t === "date" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Data mínima">
            <Input
              type="date"
              value={field.dateMin ?? ""}
              onChange={(e) => onChange({ dateMin: e.target.value })}
            />
          </Field>
          <Field label="Data máxima">
            <Input
              type="date"
              value={field.dateMax ?? ""}
              onChange={(e) => onChange({ dateMax: e.target.value })}
            />
          </Field>
        </div>
      )}

      {t === "money" && (
        <Field label="Moeda">
          <Input
            value={field.currency ?? "BRL"}
            onChange={(e) => onChange({ currency: e.target.value })}
          />
        </Field>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
      <Label className="text-sm font-normal cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
