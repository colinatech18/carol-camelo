import { useQuery } from "@tanstack/react-query";
import { Brain } from "lucide-react";
import { getClinicBranding } from "@/lib/clinicBranding";
import { cn } from "@/lib/utils";

/**
 * Exibe a logo configurada em Configurações > Marca. Enquanto carrega, ou se
 * nenhuma logo foi definida ainda, cai no ícone padrão (Brain) — o mesmo usado
 * hoje fixo na Sidebar, no login e no formulário público.
 *
 * `className` controla tamanho/formato/fundo e é aplicado tanto na <img> quanto
 * no fallback, para o layout não pular quando a logo real carregar.
 */
export function ClinicLogo({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  const { data } = useQuery({
    queryKey: ["clinic-branding"],
    queryFn: getClinicBranding,
    staleTime: 5 * 60 * 1000,
  });

  if (data?.logoUrl) {
    return (
      <img
        src={data.logoUrl}
        alt="Logo da clínica"
        className={cn("object-contain shrink-0", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
    >
      <Brain className={cn("h-5 w-5", iconClassName)} />
    </div>
  );
}