import { citedLabels } from "../src/shared/grounding";
import { MONEY_SCALES, MONEY_SCALE_PATTERN, moneyAmounts, type MoneyAmount } from "./chat-money";

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

/** The same monetary parser serves both diagnostics and repairs, including
 * numeric-only cells whose own column explicitly declares currency and scale. */
export function moneyClaimAmounts(block: ClaimBlock): MoneyAmount[] {
  const result = moneyAmounts(block.text);
  if (!block.table) return result;
  const cells = tableCells(block.text);
  if (cells.length !== block.table.headers.length) return result;
  const trimmed = block.text.trim();
  let at = block.text.indexOf(trimmed) + (trimmed.startsWith("|") ? 1 : 0);
  for (const [i, cell] of cells.entries()) {
    const header = block.table.headers[i];
    const currency = /CNY|RMB|人民币|亿元|万元/iu.test(header) ? "CNY" : /USD|US\\?\$|美元/iu.test(header) ? "USD" : "";
    const unit = header.match(new RegExp(MONEY_SCALE_PATTERN, "iu"))?.[0].toLowerCase();
    const number = cell.match(/^\s*(?:\*\*|\$)?([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)(?:\*\*|\$)?\s*(?:\[S\d+\]\s*)*$/u);
    if (currency && unit && number) result.push({ raw: number[1], start: at + cell.indexOf(number[1]), values: [Number(number[1].replace(/,/g, "").replace("−", "-"))], factor: MONEY_SCALES[unit], currency, digits: [number[1]], sharedChinese: /[亿万]/u.test(unit) });
    at += cell.length + 1;
  }
  return result.sort((a, b) => a.start - b.start);
}

/** An isolated chart label lacks the entity/scenario binding needed for automatic repair. */
export function isolatedFigureAmount(text: string, start: number, length: number): boolean {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const next = text.indexOf("\n", start + length);
  const line = text.slice(from, next < 0 ? text.length : next).trim();
  return line === text.slice(start, start + length).trim() &&
    /(?:Fig\.?\s*\d|图\s*\d|Capacity\s*\(|emissions\s*\(|Years to retirement|Stranded assets\s*\()/iu.test(text);
}
