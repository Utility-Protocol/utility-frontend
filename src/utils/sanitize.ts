export function sanitize(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim();
}

export function validateLabel(raw: string): string {
  const cleaned = sanitize(raw);
  return cleaned.length > 64 ? cleaned.slice(0, 64) : cleaned;
}
