// MyST's current renderer and dollarmath plugin import this legacy markdown-it
// subpath. markdown-it 15 intentionally exports only its public entrypoint, so
// Vite maps that single legacy helper to this equivalent implementation.
const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export function escapeHtml(value: string): string {
  return /[&<>"]/.test(value) ? value.replace(/[&<>"]/g, character => replacements[character]) : value;
}
