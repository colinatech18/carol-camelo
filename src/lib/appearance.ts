/**
 * Appearance preferences: theme color, light/dark/auto, contrast, locale, date/time format.
 * Persisted in localStorage under "clinica:appearance" and applied to <html>.
 */

export const APPEARANCE_KEY = "clinica:appearance";

export type ThemeMode = "light" | "dark" | "auto";
export type WeekStart = "sunday" | "monday";
export type TimeFormat = "24h" | "12h";
export type DateFormat = "mm/dd/yyyy" | "dd/mm/yyyy" | "yyyy/mm/dd";

export interface Appearance {
  themeColor: string; // hex
  mode: ThemeMode;
  highContrast: boolean;
  language: string;
  timezone: string;
  notifyTzChange: boolean;
  weekStart: WeekStart;
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
}

export const DEFAULT_APPEARANCE: Appearance = {
  themeColor: "#2563eb",
  mode: "auto",
  highContrast: false,
  language: "pt-BR",
  timezone: "America/Sao_Paulo",
  notifyTzChange: false,
  weekStart: "sunday",
  timeFormat: "24h",
  dateFormat: "dd/mm/yyyy",
};

export function loadAppearance(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    return { ...DEFAULT_APPEARANCE, ...(JSON.parse(raw) as Partial<Appearance>) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(a: Appearance) {
  if (typeof window === "undefined") return;
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
}

function hexLuminance(hex: string): number {
  const m = hex.replace("#", "");
  if (m.length !== 6) return 0.5;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = resolveDark(a.mode);
  root.classList.toggle("dark", dark);
  root.classList.toggle("high-contrast", a.highContrast);
  root.style.setProperty("--primary", a.themeColor);
  root.style.setProperty("--ring", a.themeColor);
  root.style.setProperty(
    "--primary-foreground",
    hexLuminance(a.themeColor) > 0.55 ? "#0b1220" : "#ffffff",
  );
  root.setAttribute("lang", a.language);
}

let mqListenerAttached = false;
export function initAppearance(): Appearance {
  const a = loadAppearance();
  applyAppearance(a);
  if (typeof window !== "undefined" && !mqListenerAttached) {
    mqListenerAttached = true;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", () => {
      const current = loadAppearance();
      if (current.mode === "auto") applyAppearance(current);
    });
  }
  return a;
}
