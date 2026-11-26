import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface StaffName {
  id: string;
  name: string;
}

async function fetchStaffNames(): Promise<StaffName[]> {
  const { data, error } = (await supabase.from("profiles").select("id, name")) as any;
  if (error) throw error;
  return (data ?? []) as StaffName[];
}

/**
 * Lista id/nome de toda a equipe (profiles é legível por qualquer autenticado),
 * só pra resolver "quem é esse id" em dropdowns e exibição — não serve pra tela
 * de gestão de membros, que precisa do profile inteiro (role incluso).
 */
export function useStaffNames() {
  return useQuery({
    queryKey: ["profiles", "names"],
    queryFn: fetchStaffNames,
  });
}
