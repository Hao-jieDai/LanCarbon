/** Currency symbols in prose are not math delimiters. Preserve code and genuine inline formulae. */
export function chatPdfMarkdown(text: string): string {
  return text.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/\b(US|CA|AU|NZ|HK|NT|SG)\$(?=\s*\d)/g, "$1\\$")
    .replace(/(?<![\\\w])\$(\d[\d,.]*\s*(?:trillion|billion|million|bn|mn))\b(?!\s*\$)/gi, (_match, amount: string) => "\\$" + amount)
  ).join("");
}
