// Accent colour → CSS variables that keep text readable (WCAG 2.2 AA) for any accent.
// --on-primary: text on accent-filled buttons (white or near-black, whichever passes 4.5:1).
// --primary-text: accent used as text — darkened (light theme) or lightened (dark theme)
// until it reaches 4.5:1 against the page surface.

export const THEME_COLORS = [
  { name: "Plum", value: "#993399" },
  { name: "Parsley", value: "#13601F" },
  { name: "Burgundy", value: "#821F1F" },
  { name: "Olive", value: "#999900" },
  { name: "Sunshine", value: "#F9B21D" },
] as const;

export const DEFAULT_ACCENT = "#993399";
/** The accent every account had before the My Diary theme; treated as "use the default". */
export const LEGACY_DEFAULT_ACCENT = "#635BFF";

const LIGHT_SURFACE = "#ffffff";
const DARK_SURFACE = "#1b1916";
const INK = "#1f1a14";

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

function mix(a: string, b: string, t: number) {
  const ca = rgb(a);
  const cb = rgb(b);
  return toHex(ca.map((v, i) => v + (cb[i]! - v) * t));
}

/** Smallest step towards black (or white) that reaches the target contrast. */
function readable(hex: string, surface: string, toward: string, target = 4.6) {
  for (let t = 0; t <= 1; t += 0.02) {
    const c = mix(hex, toward, t);
    if (contrast(c, surface) >= target) return c;
  }
  return toward;
}

export function normalizeAccent(hex: string | null | undefined) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex) || hex.toUpperCase() === LEGACY_DEFAULT_ACCENT) return DEFAULT_ACCENT;
  return hex;
}

export function accentVars(accent: string, dark: boolean): Record<string, string> {
  const primary = normalizeAccent(accent);
  return {
    "--primary": primary,
    "--on-primary": contrast("#ffffff", primary) >= 4.5 ? "#ffffff" : INK,
    "--primary-text": dark ? readable(primary, DARK_SURFACE, "#ffffff") : readable(primary, LIGHT_SURFACE, "#000000"),
  };
}
