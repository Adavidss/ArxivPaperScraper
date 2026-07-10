// Theme switching: three palettes over the same CSS variables.
// Default is mono-dark (pure black & white); the original cyan UI survives
// as "classic". The <html data-theme> attribute is set pre-paint by an
// inline script in layout.tsx and updated here on change.

export type ThemeId = "mono-dark" | "mono-light" | "classic";

export const DEFAULT_THEME: ThemeId = "mono-dark";

export const THEMES: Array<{ id: ThemeId; label: string; desc: string }> = [
  { id: "mono-dark", label: "Mono · dark", desc: "black & white (default)" },
  { id: "mono-light", label: "Mono · light", desc: "white & black" },
  { id: "classic", label: "Classic", desc: "the cyan look" },
];

export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute("data-theme", theme);
  const canvas = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-canvas")
    .trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", canvas || "#000000");
}

/** Confetti etc. read the live palette instead of hardcoding hues. */
export function themeColors(): string[] {
  const css = getComputedStyle(document.documentElement);
  return ["--color-accent", "--color-accent-2", "--color-gold", "--color-data"]
    .map((v) => css.getPropertyValue(v).trim())
    .filter(Boolean);
}
