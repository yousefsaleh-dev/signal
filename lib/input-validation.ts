export function normalizeHttpUrl(value: unknown): string | null {
  const urlText = String(value ?? "").trim();
  if (!urlText) return "";

  try {
    const url = new URL(urlText.startsWith("http") ? urlText : `https://${urlText}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
