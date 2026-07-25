export const accessibleColors = {
  foreground: "#171717",
  background: "#ffffff",
  muted: "#f5f5f5",
  mutedForeground: "#595959",
  border: "#e5e5e5",
  accent: "#f0f0f0",
  accentForeground: "#171717",
  destructive: "#dc2626",
  ring: "#4A90D9",
} as const;

export const accessibleDarkColors = {
  foreground: "#ededed",
  background: "#0a0a0a",
  muted: "#1a1a1a",
  mutedForeground: "#a3a3a3",
  border: "#404040",
  accent: "#1f1f1f",
  accentForeground: "#ededed",
  destructive: "#fca5a5",
  ring: "#6db3f2",
} as const;

export const accessibleHighContrastColors = {
  foreground: "#ffffff",
  background: "#000000",
  muted: "#1a1a1a",
  mutedForeground: "#e0e0e0",
  border: "#ffffff",
  accent: "#333333",
  accentForeground: "#ffffff",
  destructive: "#ff6666",
  ring: "#ffffff",
} as const;

export const AA_CONTRAST_RATIOS = {
  normalText: 4.5,
  largeText: 3.0,
  nonText: 3.0,
} as const;

export const FOCUS_STYLE = `2px solid ${accessibleColors.ring}`;
export const FOCUS_OFFSET = "2px";
