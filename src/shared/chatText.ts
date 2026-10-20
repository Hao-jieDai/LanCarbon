/** Applied at runtime as well as in the editable defaults, including existing configurations. */
export const PREVIOUS_CHAT_OUTPUT_GUIDELINES = `Use precise, direct academic language. Prefer concrete descriptions of mechanisms, assumptions and differences over metaphors, personification, rhetorical headings or vague abstractions. Do not present your own paraphrase as a quoted term from the paper; translate technical terms faithfully and explain uncommon terms briefly. Use calibrated wording such as 'may', 'suggests' or 'more likely' for inferences. Once that wording makes the status clear, avoid appending 'this is my interpretation', 'not explicitly stated in the excerpts' or equivalent self-referential disclaimers. Explain specific missing evidence only when it materially affects the answer; keep necessary scientific conditions and citations. Use Markdown for prose and LaTeX for mathematics: $...$ for inline math and $$ on separate lines for display math. Keep formulae out of code fences unless the user asks for source code. Use valid LaTeX commands for fractions, sums, subscripts and symbols, and explain variables in prose. These delimiters must survive copying into a Markdown note. Preserve monetary amounts as prose with currency names/codes instead of treating a currency dollar sign as a math delimiter.`;

/** Managed wording is assembled once even for saved defaults from an earlier build. */
export const CHAT_OUTPUT_GUIDELINES = PREVIOUS_CHAT_OUTPUT_GUIDELINES + " Answer the latest request in the requested language and format. Prefer concise paraphrases with relevant citations; use short quotations when fidelity requires them or the user asks. Include numbers, examples and background only when needed for the requested answer. Avoid unrequested inventories, repeated results, editorial notes, prefatory labels and unnecessary sections. A specific missing fact needs one brief local explanation; it does not need a catalogue of unrelated evidence. Explain what a percentage describes (remaining level or change), and distinguish reported precision from exact arithmetic.";

export function responseGuidelines(saved: string): string {
  const managed = new Set([PREVIOUS_CHAT_OUTPUT_GUIDELINES, CHAT_OUTPUT_GUIDELINES]);
  const preferences = saved.split(/\r?\n[ \t]*\r?\n/u).filter(paragraph => !managed.has(paragraph.trim())).join("\n\n").trim();
  return [preferences, CHAT_OUTPUT_GUIDELINES].filter(Boolean).join("\n\n");
}

/** Normalize explicit LaTeX delimiters, never infer a formula from ordinary text. */
export function chatMarkdown(text: string): string {
  return text.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_match, math: string) => `$${math.trim()}$`)
    .replace(/\b(US|CA|AU|NZ|HK|NT|SG)\$(?=\s*\d)/g, "$1\\$")
    .replace(/(?<![\\\w])\$(\d[\d,.]*\s*(?:trillion|billion|million|bn|mn))\b(?!\s*\$)/gi, (_match, amount: string) => "\\$" + amount)
  ).join("");
}
