import { supabase } from "@/lib/supabase";

export interface ClinicBranding {
  logoUrl: string | null;
}

const BUCKET = "clinic-assets";
const LOGO_PREFIX = "branding";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export async function getClinicBranding(): Promise<ClinicBranding> {
  const { data, error } = await supabase
    .from("clinic_branding")
    .select("logo_url")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return { logoUrl: data?.logo_url ?? null };
}

async function clearExistingLogoFiles(): Promise<void> {
  const { data: existing } = await supabase.storage.from(BUCKET).list(LOGO_PREFIX);
  if (existing && existing.length > 0) {
    await supabase.storage.from(BUCKET).remove(existing.map((f) => `${LOGO_PREFIX}/${f.name}`));
  }
}

/**
 * Sobe uma nova logo e atualiza `clinic_branding.logo_url`.
 * Remove o arquivo anterior antes de subir o novo (não acumula lixo no bucket).
 * O nome do arquivo inclui um timestamp para evitar que o navegador sirva a
 * versão antiga da imagem a partir do cache (a URL muda a cada upload).
 */
export async function uploadClinicLogo(file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Formato não suportado. Use PNG, JPG, SVG ou WEBP.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Arquivo muito grande. Tamanho máximo: 2MB.");
  }

  await clearExistingLogoFiles();

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${LOGO_PREFIX}/logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const logoUrl = pub.publicUrl;

  const { data: sessionData } = await supabase.auth.getSession();
  const { error: updateError } = await supabase
    .from("clinic_branding")
    .update({ logo_url: logoUrl, updated_by: sessionData.session?.user.id ?? null })
    .eq("id", true);
  if (updateError) throw updateError;

  return logoUrl;
}

export async function removeClinicLogo(): Promise<void> {
  await clearExistingLogoFiles();
  const { error } = await supabase
    .from("clinic_branding")
    .update({ logo_url: null })
    .eq("id", true);
  if (error) throw error;
}