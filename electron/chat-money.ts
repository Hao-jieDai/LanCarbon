/** Monetary syntax shared by arithmetic aids, diagnostics and conservative repairs.
 * A parsed amount does not establish its metric, entity, scenario or economic comparability.
 */
export const MONEY_SCALES: Readonly<Record<string, number>> = { trillion: 1e12, billion: 1e9, million: 1e6, 万亿: 1e12, 千亿: 1e11, 百亿: 1e10, 十亿: 1e9, 亿: 1e8, 百万: 1e6, 万: 1e4 };
// Longest units must win: independently matching 亿 inside 十亿 corrupts an
// otherwise correct table. Inline text, column headings and conversions share it.
const scalePattern = (units: string[]) => `(?<![十百千万亿])(?:${units.sort((a, b) => b.length - a.length).join("|")})(?![十百千万亿])`;
export const MONEY_SCALE_PATTERN = scalePattern(Object.keys(MONEY_SCALES));
export const CHINESE_MONEY_SCALE_PATTERN = scalePattern(Object.keys(MONEY_SCALES).filter(unit => /[亿万]/u.test(unit)));
const englishScalePattern = Object.keys(MONEY_SCALES).filter(unit => /^[a-z]+$/u.test(unit)).sort((a, b) => b.length - a.length).join("|");
export interface MoneyAmount {
  raw: string; start: number; values: number[]; digits: string[];
  factor: number; currency: "CNY" | "USD";
  sharedChinese?: boolean;
  notation?: string;
  sharedSpan?: { start: number; length: number };
}

export function moneyAmounts(text: string): MoneyAmount[] {
  // Preserve offsets when recognizing numeric-only inline math.
  const readable = text.replace(/(?<!\\)\$([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)\$/gu, (_match, digits: string) => ` ${digits} `);
  const expression = new RegExp(String.raw`(?:(CNY|RMB|USD|US\\?\$)\s*)?([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(?:to|[-–—~～至])\s*(CNY|RMB|USD|US\\?\$)?\s*([+−-]?\d+(?:,\d{3})*(?:\.\d+)?))?\s*(${MONEY_SCALE_PATTERN})[ \t]*(CNY|RMB|USD|US\\?\$|美元|人民币|元(?:人民币)?|dollars)?`, "giu");
  const result: MoneyAmount[] = [...readable.matchAll(expression)].flatMap(match => {
    const currencies = [match[1], match[3], match[6]].filter((value): value is string => !!value).map(value => /CNY|RMB|人民币|^元$/iu.test(value) ? "CNY" as const : "USD" as const);
    if (!currencies.length || new Set(currencies).size !== 1) return [];
    const digits = [match[2], ...(match[4] ? [match[4]] : [])];
    return [{ raw: text.slice(match.index!, match.index! + match[0].length), start: match.index!, digits, values: digits.map(value => Number(value.replace(/,/g, "").replace("−", "-"))), factor: MONEY_SCALES[match[5].toLowerCase()], currency: currencies[0] }];
  });
  const coordinated: MoneyAmount[] = [
    ...chineseListAmounts(readable).map(item => ({ raw: text.slice(item.start, item.start + item.raw.length), start: item.start, digits: [item.digits], values: [item.value], factor: item.factor, currency: item.currency, sharedChinese: true })),
    ...parenthesizedMoney(readable).map(item => ({ raw: text.slice(item.start, item.start + item.raw.length), start: item.start, digits: [item.digits], values: [item.value], factor: item.factor, currency: item.currency })),
    ...sharedScaleAmounts(readable).map(item => ({ raw: text.slice(item.start, item.start + item.memberLength), start: item.start, digits: [item.digits], values: [item.value], factor: item.factor, currency: item.currency, notation: item.original, sharedSpan: { start: item.spanStart, length: item.spanLength } }))
  ];
  for (const item of coordinated) {
    const existing = result.find(amount => amount.start <= item.start && item.start < amount.start + amount.raw.length && amount.factor === item.factor && amount.currency === item.currency && amount.values.includes(item.values[0]));
    if (existing) { if (item.sharedSpan) existing.sharedSpan = item.sharedSpan; if (item.sharedChinese) existing.sharedChinese = true; }
    else result.push(item);
  }
  return result.sort((a, b) => a.start - b.start);
}

/** Chinese coordinated amounts may share the final scale and currency. */
export function chineseListAmounts(text: string): Array<{ raw: string; start: number; value: number; digits: string; factor: number; currency: "USD" | "CNY" }> {
  const number = String.raw`[+−-]?\d+(?:,\d{3})*(?:\.\d+)?`;
  const expression = new RegExp(`(?<![\\d.])${number}(?:\\s*(?:、|,|，|和|及|与|[/／]|and\\s+)\\s*${number}){1,7}\\s*(${CHINESE_MONEY_SCALE_PATTERN})\\s*(人民币|美元|元(?:人民币)?)`, "giu");
  const result: ReturnType<typeof chineseListAmounts> = [];
  for (const match of text.matchAll(expression)) {
    if (/[/／]/u.test(match[0])) {
      // A slash can mean division. Inherit the shared unit only when prose
      // declares an ordered list or an adjoining label list identifies its members.
      const prefix = text.slice(Math.max(0, match.index! - 100), match.index!).split(/[。！？;；\n]/u).at(-1)!;
      const suffix = text.slice(match.index! + match[0].length, match.index! + match[0].length + 150);
      const labels = /^\s*[（(]([^()（）\n]+)[）)]/u.exec(suffix)?.[1].split(/[、,，/／]/u).map(label => label.trim());
      const members = [...match[0].matchAll(new RegExp(number, "gu"))];
      if (!/分别|依次|对应|\brespectively\b/iu.test(prefix) && !(labels?.length === members.length && labels.every(label => /[\p{L}]/u.test(label)))) continue;
    }
    const factor = MONEY_SCALES[match[1]];
    for (const item of match[0].matchAll(new RegExp(number, "gu"))) result.push({ raw: item[0], start: match.index! + item.index!, value: Number(item[0].replace(/,/g, "").replace("−", "-")), digits: item[0], factor, currency: match[2] === "美元" ? "USD" : "CNY" });
  }
  return result;
}

/** Bare parenthesized money inherits only an explicit currency in the same sentence.
 * An intervening sentence, conflicting currency or non-monetary unit ends inference. */
export function parenthesizedMoney(text: string): Array<{ raw: string; start: number; value: number; digits: string; factor: number; currency: "USD" | "CNY" }> {
  const result: ReturnType<typeof parenthesizedMoney> = [];
  for (const match of text.matchAll(new RegExp(String.raw`[（(]\s*([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)\s*(${englishScalePattern})\s*[）)]`, "giu"))) {
    const from = Math.max(0, match.index! - 400);
    const prefix = text.slice(from, match.index!);
    const boundaries = [...prefix.matchAll(/[。！？!?]|(?<!\d)\.|\.(?!\d)/gu)];
    const local = prefix.slice(boundaries.length ? boundaries.at(-1)!.index! + 1 : 0);
    const currencies = [...local.matchAll(/CNY|RMB|USD|US\\?\$|人民币|美元/giu)].map(item => /CNY|RMB|人民币/iu.test(item[0]) ? "CNY" as const : "USD" as const);
    if (!currencies.length || new Set(currencies).size !== 1 || !/(?:billion|trillion|million)\s*(?:CNY|RMB|USD|US\\?\$)|(?:CNY|RMB|USD|US\\?\$)\s*[\d,.]+\s*(?:billion|trillion|million)/iu.test(local)) continue;
    result.push({ raw: match[0], start: match.index!, digits: match[1], value: Number(match[1].replace(/,/g, "").replace("−", "-")), factor: MONEY_SCALES[match[2].toLowerCase()], currency: currencies[0] });
  }
  return result;
}

/** A coordinated monetary list can declare its English scale once at the end.
 * Explicit, uniform currency markers keep counts and mixed-currency lists out. */
export function sharedScaleAmounts(text: string): Array<{ original: string; start: number; digits: string; value: number; factor: number; currency: "USD" | "CNY"; spanStart: number; spanLength: number; memberLength: number }> {
  const currency = String.raw`(?:CNY|RMB|USD|US\\?\$)`, number = String.raw`[+−-]?\d+(?:,\d{3})*(?:\.\d+)?`;
  const expression = new RegExp(`${currency}\\s*${number}(?:\\s*(?:,\\s*(?:(?:and|or)\\s+)?|and\\s+|or\\s+|to\\s+|[-–—~～至])\\s*(?:${currency}\\s*)?${number}){1,7}\\s*(${englishScalePattern})\\b`, "giu");
  const result: ReturnType<typeof sharedScaleAmounts> = [];
  for (const match of text.matchAll(expression)) {
    const markers = [...match[0].matchAll(new RegExp(currency, "giu"))].map(item => /CNY|RMB/iu.test(item[0]) ? "CNY" as const : "USD" as const);
    if (new Set(markers).size !== 1) continue;
    const factor = MONEY_SCALES[match[1].toLowerCase()];
    for (const value of match[0].matchAll(new RegExp(`(?:${currency}\\s*)?(${number})`, "giu"))) {
      result.push({ original: value[0] + ` ${match[1]} (shared scale)`, start: match.index! + value.index!, digits: value[1], value: Number(value[1].replace(/,/g, "").replace("−", "-")), factor, currency: markers[0], spanStart: match.index!, spanLength: match[0].length, memberLength: value[0].length });
    }
  }
  return result;
}

