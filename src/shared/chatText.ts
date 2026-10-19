/** Applied at runtime as well as in the editable defaults, including existing configurations. */
export const CHAT_OUTPUT_GUIDELINES = `Use precise, direct academic language. Prefer concrete descriptions of mechanisms, assumptions and differences over metaphors, personification, rhetorical headings or vague abstractions. Do not present your own paraphrase as a quoted term from the paper; translate technical terms faithfully and explain uncommon terms briefly. Use Markdown for prose and LaTeX for mathematics: $...$ for inline math and $$ on separate lines for display math. Keep formulae out of code fences unless the user asks for source code. Use valid LaTeX commands for fractions, sums, subscripts and symbols, and explain variables in prose. These delimiters must survive copying into a Markdown note. Preserve monetary amounts as prose with currency names/codes instead of treating a currency dollar sign as a math delimiter.`;

/** Normalize explicit LaTeX delimiters, never infer a formula from ordinary text. */
export function chatMarkdown(text: string): string {
  return text.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_match, math: string) => `$${math.trim()}$`)
    .replace(/\b(US|CA|AU|NZ|HK|NT|SG)\$(?=\s*\d)/g, "$1\\$")
    .replace(/(?<![\\\w])\$(\d[\d,.]*\s*(?:trillion|billion|million|bn|mn))\b(?!\s*\$)/gi, (_match, amount: string) => "\\$" + amount)
  ).join("");
}
