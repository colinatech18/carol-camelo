import type { Criticality } from "@/types";
import { cn } from "@/lib/utils";

const MAP: Record<Criticality, { label: string; cls: string; dot: string }> = {
  red:    { label: "Crítico",      cls: "bg-danger/15 text-danger border-danger/30",     dot: "bg-danger" },
  yellow: { label: "Atenção",      cls: "bg-warning/20 text-warning-foreground border-warning/40", dot: "bg-warning" },
  green:  { label: "Estável",      cls: "bg-success/15 text-success-foreground border-success/30",  dot: "bg-success" },
  unknown:{ label: "Sem dados",    cls: "bg-muted text-muted-foreground border-border",  dot: "bg-muted-foreground" },
};

export function CriticalityBadge({ level, className }: { level: Criticality; className?: string }) {
  const m = MAP[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", m.cls, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}
