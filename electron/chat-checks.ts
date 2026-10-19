/** Validate explicit same-unit arithmetic, without evaluating code or rewriting a scientific claim. */
export function arithmeticWarnings(text: string): string[] {
  const warnings: string[] = [], plain = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
  const number = "-?\\d+(?:,\\d{3})*(?:\\.\\d+)?";
  const pattern = new RegExp(`(?<![\\w.])(${number}(?:\\s*[+−–×÷*/-]\\s*${number}){1,8})\\s*(?:=|＝|≈)\\s*(${number})(%)?`, "gu");
  const checkResult = (expression: string, result: number, claimed: string, percent = "") => {
    const stated = Number(claimed.replace(/,/g, "")), expected = result * (percent ? 100 : 1), decimals = claimed.split(".")[1]?.length ?? 0;
    if (warnings.length < 5 && Number.isFinite(expected) && Math.abs(expected - stated) > Math.max(0.51 * 10 ** -decimals, Math.abs(expected) * 1e-8)) warnings.push(`Calculation needs checking: ${expression}; calculated result = ${Number(expected.toFixed(Math.min(decimals + 2, 8)))}${percent}. Check the operands and units against the source.`);
  };
  const check = (expression: string, left: string, op: string, right: string, claimed: string, percent = "") => {
    const [a, b] = [left, right].map(s => Number(s.replace(/,/g, "")));
    const result = op === "+" ? a + b : /[-−–]/.test(op) ? a - b : /[×*]/.test(op) ? a * b : b ? a / b : NaN;
    if (percent && !/[÷/]/.test(op)) return;
    checkResult(expression, result, claimed, percent);
  };
  for (const match of plain.matchAll(pattern)) {
    // Never validate just the tail of a longer expression as if it were the whole sum.
    if (/[+−–×÷*/-]$/u.test(plain.slice(0, match.index!).trimEnd())) continue;
    const first = match[1].match(new RegExp(`^${number}`, "u"))!;
    const terms = [Number(first[0].replace(/,/g, ""))], operations: string[] = [];
    let remaining = match[1].slice(first[0].length);
    while (remaining.trim()) {
      const term = remaining.match(new RegExp(`^\\s*([+−–×÷*/-])\\s*(${number})`, "u"));
      if (!term) break;
      const op = term[1], value = Number(term[2].replace(/,/g, "")); operations.push(op);
      if (/[×*]/u.test(op)) terms[terms.length - 1] *= value;
      else if (/[÷/]/u.test(op)) terms[terms.length - 1] = value ? terms.at(-1)! / value : NaN;
      else terms.push(/[-−–]/u.test(op) ? -value : value);
      remaining = remaining.slice(term[0].length);
    }
    if (remaining.trim() || match[3] && (operations.length !== 1 || !/[÷/]/u.test(operations[0]))) continue;
    checkResult(match[0], terms.reduce((sum, value) => sum + value, 0), match[2], match[3]);
  }
  // Scientific prose also writes the result first: 123 million (200 − 80).
  // An ascending dash pair is usually an interval, e.g. 18.9 trillion (16–21.7).
  // Subtraction with an explicit equals sign remains checked above in either order.
  const resultFirst = new RegExp(`(?<![\\w.])(${number})\\s*(?:亿元|万元|万亿美元|亿美元|万亿|百万|billion|million|trillion)?\\s*[（(]\\s*(${number})\\s*([+−–×÷*/-])\\s*(${number})\\s*[）)]`, "giu");
  for (const match of plain.matchAll(resultFirst)) {
    if (/[-–]/.test(match[3]) && Number(match[2].replace(/,/g, "")) <= Number(match[4].replace(/,/g, ""))) continue;
    check(match[0], match[2], match[3], match[4], match[1]);
  }
  return warnings;
}
