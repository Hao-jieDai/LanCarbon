export interface RelativeQuantityAid {
  original: string;
  relation: "remaining-level" | "decrease" | "increase";
  levelPercent: number[];
  changePercent: number[];
  context: string;
}

/** Algebra on explicitly relative percentages only. An absolute rate of 20%
 * does not imply a change of -80% without a stated baseline. */
export function relativeQuantityAids(text: string): RelativeQuantityAid[] {
  const plain = text.replace(/\s+/g, " ");
  const number = String.raw`(\d+(?:\.\d+)?)`;
  const percentage = `${number}(?:\\s*[%％]?\\s*(?:[-–—~～至]|to)\\s*${number})?\\s*[%％]`;
  const patterns = [
    new RegExp(`(降低|下降|减少|缩减|削减|降|减)(至|到|为|了)?((?:(?:\\d{4}\\s*年)|[^\\d%％。；;]){0,24}?)${percentage}`, "gu"),
    new RegExp(`\\b(reduc\\w*|decreas\\w*|lower\\w*|fell|falls?|declin\\w*|increas\\w*|rose|rises?)\\s+(to|by)\\s*()${percentage}`, "giu")
  ];
  const result: RelativeQuantityAid[] = [];
  for (const pattern of patterns) for (const match of plain.matchAll(pattern)) {
    const values = [Number(match[4]), ...(match[5] ? [Number(match[5])] : [])];
    if (values.some(value => value > 100)) continue;
    const suffix = plain.slice(match.index! + match[0].length, match.index! + match[0].length + 60);
    if (/^\s*(?:个?百分点|percentage points?)/iu.test(suffix)) continue;
    const to = /^(?:至|到|为|to)$/iu.test(match[2] ?? "");
    if (to && !/(?:基准|原来|原有|原始|上年|\d{4}\s*年.{0,8}水平)/u.test(match[3]) && !/^\s*of\s+(?:the\s+)?(?:baseline|original|initial|previous)\b/iu.test(suffix)) continue;
    const increase = /^(?:increas|rose|rises?)/iu.test(match[1]);
    const changes = to ? values.map(value => value - 100) : values.map(value => increase ? value : -value);
    result.push({ original: match[0], relation: to ? "remaining-level" : increase ? "increase" : "decrease", levelPercent: to ? values : changes.map(value => 100 + value), changePercent: changes, context: plain.slice(Math.max(0, match.index! - 80), match.index! + match[0].length + 80) });
    if (result.length >= 3) return result;
  }
  return result;
}
