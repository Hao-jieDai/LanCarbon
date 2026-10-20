import { citedLabels } from "../src/shared/grounding";

export interface ClaimBlock { text: string; start: number; table?: { headers: string[]; labels: Set<string> } }
const tableCells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/u);
const separator = (line: string) => tableCells(line).length > 1 && tableCells(line).every(cell => /^\s*:?-{3,}:?\s*$/u.test(cell));

/** Only a table's immediately adjacent caption can supply shared citations.
 * A new heading, paragraph or table ends that scope; explicit row citations win. */
export function monetaryBlocks(text: string): ClaimBlock[] {
  const blocks: ClaimBlock[] = [];
  let previous = "", offset = 0;
  for (const paragraph of text.split(/(\n\s*\n)/u)) {
    const start = offset; offset += paragraph.length;
    if (!paragraph.trim()) continue;
    const lines = paragraph.split("\n");
    const header = lines.findIndex((line, i) => line.includes("|") && i + 1 < lines.length && separator(lines[i + 1]));
    if (header < 0) blocks.push({ text: paragraph, start });
    else {
      const intro = lines.slice(0, header).join("\n").trim() || previous;
      const caption = intro.length <= 1500 && !intro.includes("\n\n") &&
        (/^\s*(?:#{1,6}\s|\*\*|Table\b|表\s*\d)/iu.test(intro) || /[:：]\s*(?:\[S\d+\]\s*)*$/u.test(intro));
      const labels = caption ? citedLabels(intro) : new Set<string>();
      const table = { headers: tableCells(lines[header]), labels };
      let local = 0;
      for (const [i, line] of lines.entries()) {
        blocks.push({ text: line, start: start + local, ...(i > header + 1 && line.includes("|") ? { table } : {}) });
        local += line.length + 1;
      }
    }
    previous = paragraph.trim();
  }
  return blocks;
}

/** Bind an amount to its sentence and nearest citation group, never the next sentence. */
export function monetaryLabels(block: ClaimBlock, position: number, length: number): Set<string> {
  const text = block.text;
  let start = 0, end = text.length;
  for (const boundary of text.matchAll(/[。！？\n!?]|(?<!\d)\.|\.(?!\d)/gu)) {
    const at = boundary.index!;
    if (at < position) start = at + 1;
    else if (at >= position + length) {
      end = at + 1;
      const trailing = text.slice(end).match(/^[ \t]*(?:\[S\d+\][ \t]*)+/u);
      if (trailing) end += trailing[0].length;
      break;
    }
  }
  const groups = [...text.slice(start, end).matchAll(/\[S\d+\](?:[ \t,，]*\[S\d+\])*/gu)];
  const group = groups.find(group => start + group.index! >= position + length) ?? groups.at(-1);
  if (group) return citedLabels(group[0]);
  // An explicit row attribution must not borrow the caption's other sources.
  const rowLabels = block.table ? citedLabels(text) : new Set<string>();
  return rowLabels.size ? rowLabels : new Set(block.table?.labels);
}

export { tableCells };

/** Chinese coordinated amounts may share the final scale and currency. */
export function chineseListAmounts(text: string): Array<{ raw: string; start: number; value: number; digits: string; factor: number; currency: "USD" | "CNY" }> {
  const number = String.raw`[+−-]?\d+(?:,\d{3})*(?:\.\d+)?`;
  const expression = new RegExp(`(?<![\\d.])${number}(?:\\s*(?:、|,|，|和|及|与|and\\s+)\\s*${number}){1,7}\\s*(万亿|千亿|百亿|百万|亿|万)\\s*(人民币|美元|元)`, "giu");
  const result: ReturnType<typeof chineseListAmounts> = [];
  for (const match of text.matchAll(expression)) {
    const factor = ({ 万亿: 1e12, 千亿: 1e11, 百亿: 1e10, 百万: 1e6, 亿: 1e8, 万: 1e4 } as Record<string, number>)[match[1]];
    for (const item of match[0].matchAll(new RegExp(number, "gu"))) result.push({ raw: item[0], start: match.index! + item.index!, value: Number(item[0].replace(/,/g, "").replace("−", "-")), digits: item[0], factor, currency: match[2] === "美元" ? "USD" : "CNY" });
  }
  return result;
}

/** Bare parenthesized money inherits only an explicit currency in the same sentence.
 * An intervening sentence, conflicting currency or non-monetary unit ends inference. */
export function parenthesizedMoney(text: string): Array<{ raw: string; start: number; value: number; digits: string; factor: number; currency: "USD" | "CNY" }> {
  const result: ReturnType<typeof parenthesizedMoney> = [];
  for (const match of text.matchAll(/[（(]\s*([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)\s*(trillion|billion|million)\s*[）)]/giu)) {
    const from = Math.max(0, match.index! - 400);
    const prefix = text.slice(from, match.index!);
    const boundaries = [...prefix.matchAll(/[。！？!?]|(?<!\d)\.|\.(?!\d)/gu)];
    const local = prefix.slice(boundaries.length ? boundaries.at(-1)!.index! + 1 : 0);
    const currencies = [...local.matchAll(/CNY|RMB|USD|US\\?\$|人民币|美元/giu)].map(item => /CNY|RMB|人民币/iu.test(item[0]) ? "CNY" as const : "USD" as const);
    if (!currencies.length || new Set(currencies).size !== 1 || !/(?:billion|trillion|million)\s*(?:CNY|RMB|USD|US\\?\$)|(?:CNY|RMB|USD|US\\?\$)\s*[\d,.]+\s*(?:billion|trillion|million)/iu.test(local)) continue;
    result.push({ raw: match[0], start: match.index!, digits: match[1], value: Number(match[1].replace(/,/g, "").replace("−", "-")), factor: ({ trillion: 1e12, billion: 1e9, million: 1e6 } as Record<string, number>)[match[2].toLowerCase()], currency: currencies[0] });
  }
  return result;
}

/** A coordinated monetary list can declare its English scale once at the end.
 * Explicit, uniform currency markers keep counts and mixed-currency lists out. */
export function sharedScaleAmounts(text: string): Array<{ original: string; start: number; digits: string; value: number; factor: number; currency: "USD" | "CNY"; spanStart: number; spanLength: number }> {
  const currency = String.raw`(?:CNY|RMB|USD|US\\?\$)`, number = String.raw`[+−-]?\d+(?:,\d{3})*(?:\.\d+)?`;
  const expression = new RegExp(`${currency}\\s*${number}(?:\\s*(?:,\\s*(?:(?:and|or)\\s+)?|and\\s+|or\\s+|to\\s+|[-–—~～至])\\s*(?:${currency}\\s*)?${number}){1,7}\\s*(trillion|billion|million)\\b`, "giu");
  const result: ReturnType<typeof sharedScaleAmounts> = [];
  for (const match of text.matchAll(expression)) {
    const markers = [...match[0].matchAll(new RegExp(currency, "giu"))].map(item => /CNY|RMB/iu.test(item[0]) ? "CNY" as const : "USD" as const);
    if (new Set(markers).size !== 1) continue;
    const factor = ({ trillion: 1e12, billion: 1e9, million: 1e6 } as Record<string, number>)[match[1].toLowerCase()];
    for (const value of match[0].matchAll(new RegExp(`(?:${currency}\\s*)?(${number})`, "giu"))) {
      result.push({ original: value[0] + ` ${match[1]} (shared scale)`, start: match.index! + value.index!, digits: value[1], value: Number(value[1].replace(/,/g, "").replace("−", "-")), factor, currency: markers[0], spanStart: match.index!, spanLength: match[0].length });
    }
  }
  return result;
}

/** An isolated chart label lacks the entity/scenario binding needed for automatic repair. */
export function isolatedFigureAmount(text: string, start: number, length: number): boolean {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const next = text.indexOf("\n", start + length);
  const line = text.slice(from, next < 0 ? text.length : next).trim();
  return line === text.slice(start, start + length).trim() &&
    /(?:Fig\.?\s*\d|图\s*\d|Capacity\s*\(|emissions\s*\(|Years to retirement|Stranded assets\s*\()/iu.test(text);
}
