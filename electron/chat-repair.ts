import { citedLabels, mapCitations, type ChatEvidence } from "../src/shared/grounding";
import { isolatedFigureAmount, monetaryBlocks, monetaryLabels, moneyClaimAmounts as blockAmounts, tableCells } from "./chat-claims";
import { MONEY_SCALES as factors, moneyAmounts, type MoneyAmount } from "./chat-money";
type Amount = MoneyAmount & { derived?: boolean };
function amounts(text: string): Amount[] { return moneyAmounts(text); }

function supportedAmounts(hit: ChatEvidence): Amount[] {
  const text = hit.chunk.text;
  const originals = amounts(text).filter(amount => !isolatedFigureAmount(text, amount.sharedSpan?.start ?? amount.start, amount.sharedSpan?.length ?? amount.raw.length));
  const endpoints = originals.filter(amount => amount.values.length === 2).flatMap(amount => amount.values.map((value, i) => ({ ...amount, values: [value], digits: [amount.digits[i]] })));
  return [...originals, ...endpoints];
}

/** A cited subtraction can be checked even when the paper reports only its operands.
 * Keep the original currency/scale and require an exact, uniquely scaled difference.
 * These arithmetic candidates do not establish that two scenarios should be compared. */
function subtractionAmounts(hit: ChatEvidence): Amount[] {
  const originals = supportedAmounts(hit).filter(amount => amount.values.length === 1 && amount.values[0] >= 0);
  const distinct = originals.filter((amount, i) => originals.findIndex(other => other.currency === amount.currency && other.factor === amount.factor && other.values[0] === amount.values[0]) === i).slice(0, 12);
  const result: Amount[] = [];
  for (let i = 0; i < distinct.length; i++) for (let j = i + 1; j < distinct.length; j++) {
    const a = distinct[i], b = distinct[j];
    if (a.currency !== b.currency || a.factor !== b.factor) continue;
    const value = Number(Math.abs(a.values[0] - b.values[0]).toPrecision(12));
    if (value) result.push({ ...a, raw: `difference between ${a.raw} and ${b.raw}`, values: [value], digits: [String(value)], derived: true });
  }
  return result;
}

/** Protect invented examples, not a paper's reported modelling assumptions or factual enumerations. */
function hypotheticalAt(paragraph: string, position: number): boolean {
  let hypothetical = false;
  const prefix = paragraph.slice(0, position);
  const events = /假设|假定|假如|如果|示例|例如(?=\s*(?:一[家位名座个项]|某[家个一]))|\bassum(?:e|ing)\b|\bsuppos(?:e|ing)\b|\bhypothetical\b|\bfor example\s*,?\s*(?:a|an|one)\b|(?:原文|报告|论文|研究|作者).{0,12}(?:显示|报告|估计|指出|发现)|(?:the study|the report|the paper|authors?)\s+(?:reports?|estimates?|finds?|shows?)/giu;
  for (const event of prefix.matchAll(events)) {
    const before = prefix.slice(Math.max(0, event.index! - 45), event.index!);
    const after = prefix.slice(event.index! + event[0].length);
    const reported = /(?:本文|论文|研究|模型|情景|作者|原文)(?:中|的)?(?:所)?\s*$|(?:model|study|paper|authors?)(?:\s+is)?\s*$/iu.test(before)
      || /(?:在|基于)[^。！？;\n]{0,35}$/u.test(before) && /^[^。！？;\n]{0,60}(?:下|条件下)[，,]?/u.test(after) && !/一[家位名座个项]|某[家个一]|假想|示例/u.test(before + after);
    if (/^(?:原文|报告|论文|研究|作者|the |authors?)/iu.test(event[0])) hypothetical = false;
    else if (/^(?:假[设定]|assuming)$/iu.test(event[0]) && reported) continue;
    else hypothetical = true;
  }
  return hypothetical;
}
/** Correct only an exact cited amount/range with an unambiguous scale. Never infer scenarios, FX or missing data. */
export function repairCitedUnits(text: string, evidence: ChatEvidence[]): { text: string; corrections: string[] } {
  const corrections: string[] = [];
  const normalized = mapCitations(text);
  const result = normalized.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part;
    let output = part;
    for (const block of monetaryBlocks(part).reverse()) {
      const paragraph = block.text;
      const subtraction = !block.table && /相减|差额|少(?:损失)?\s*\d|\bdifference\b|\bsubtract|\bless\s+than\b/iu.test(paragraph);
      // A declared calculation may cite its original operands in the next sentence
      // of the same paragraph. Do not extend ordinary prose or multi-source citations.
      const paragraphLabels = citedLabels(paragraph);
      const paragraphHits = evidence.filter(hit => paragraphLabels.has(hit.label));
      const declaredCalculation = subtraction && /按原文数值相减|由(?:原文|报告|论文|所引)[^。！？\n]{0,24}(?:相减|计算)|(?:calculated|computed)\s+(?:by subtracting|from\s+(?:the\s+)?(?:source|original))/iu.test(paragraph)
        && paragraphHits.length > 0 && new Set(paragraphHits.map(hit => hit.source.id)).size === 1
        && [...paragraphLabels].every(label => paragraphHits.some(hit => hit.label === label));
      for (const claim of blockAmounts(block).reverse()) {
        // An undeclared slash expression may be a ratio, not a monetary list.
        // Do not repair only its last operand when shared-list parsing declined it.
        if (!claim.sharedChinese && /[/／]\s*$/u.test(paragraph.slice(0, claim.start))) continue;
        const suffix = paragraph.slice(claim.start + claim.raw.length).split(/[。！？\n]/u, 1)[0];
        if (!(claim.sharedChinese || /[亿万]/u.test(claim.raw)) || corrections.length >= 24 || hypotheticalAt(paragraph, claim.start) || /^[ \t]*[（(]\s*(?:假设|假定|示例|hypothetical)/iu.test(suffix)) continue;
        let labels = monetaryLabels(block, claim.start, claim.raw.length);
        if (!labels.size && declaredCalculation) labels = paragraphLabels;
        if (block.table && !/\[S\d+\]/u.test(paragraph) && new Set(evidence.filter(hit => labels.has(hit.label)).map(hit => hit.source.id)).size !== 1) continue;
        // Low-confidence OCR is not an authoritative basis for silently changing a value.
        const originals = evidence.filter(hit => labels.has(hit.label) && !hit.chunk.anchor.needsReview && (hit.chunk.anchor.method !== "ocr" || (hit.chunk.anchor.confidence ?? 0) >= 80)).flatMap(hit => [...supportedAmounts(hit), ...(subtraction ? subtractionAmounts(hit) : [])].map(amount => ({ ...amount, label: hit.label })));
        const compatible = originals.filter(item => item.currency === claim.currency && item.values.length === claim.values.length);
        if (compatible.some(item => item.values.every((value, i) => Math.abs(value * item.factor - claim.values[i] * claim.factor) <= Math.max(0.005 * claim.factor, Math.abs(value * item.factor) * 1e-8)))) continue;
        const matching = compatible.filter(item => item.values.every((value, i) => value === claim.values[i]));
        if (!matching.length || new Set(matching.map(item => item.factor)).size !== 1 || matching[0].factor === claim.factor) continue;
        const source = matching[0], ratio = source.factor / claim.factor;
        // Keep the reader's target unit; compute its number outside the language model.
        let replacement = claim.raw, offset = 0;
        for (const [i, digits] of claim.digits.entries()) { const start = replacement.indexOf(digits, offset); if (start < 0) break; const value = Number((claim.values[i] * ratio).toPrecision(12)).toString(); replacement = replacement.slice(0, start) + value + replacement.slice(start + digits.length); offset = start + value.length; }
        const at = block.start + claim.start;
        if (replacement !== claim.raw) { output = output.slice(0, at) + replacement + output.slice(at + claim.raw.length); corrections.push(`Unit corrected using [${source.label}]: ${claim.raw.trim()} → ${replacement.trim()}${claim.sharedChinese ? ` (${block.table ? "table" : "shared"} unit: ${claim.currency}, factor ${claim.factor})` : ""}${source.derived ? " (difference of cited same-unit operands)" : ""}.`); }
      }
    }
    return repairCalculatedEquivalents(repairRepeatedCalculations(repairTableConversions(output, evidence, corrections), evidence, corrections), evidence, corrections);
  }).join("");
  return { text: result, corrections };
}

/** Verify a written arithmetic equivalence against cited operands, not a matching
 * mantissa. A correct subtraction can still be followed by a wrong converted
 * amount whose digits differ from every original amount. No entity/FX inference. */
function repairCalculatedEquivalents(text: string, evidence: ChatEvidence[], corrections: string[]): string {
  const number = String.raw`[+−-]?\d+(?:,\d{3})*(?:\.\d+)?`;
  const unit = "万亿|千亿|百亿|十亿|百万|亿|万", currency = "元人民币|人民币|美元|元";
  const expression = new RegExp(`(?<![\\d.])(${number})\\s*([-−+])\\s*(${number})\\s*[=＝]\\s*(${number})\\s*(?:\\$|\\\\\\))?\\s*[（(]\\s*(${unit})\\s*(${currency})\\s*[）)]\\s*[，,]\\s*(?:即|折合|相当于|等于)\\s*(?:约)?\\s*(${number})\\s*(${unit})\\s*(${currency})`, "gu");
  const value = (digits: string) => Number(digits.replace(/,/g, "").replace("−", "-"));
  const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-10);
  const edits: Array<{ at: number; digits: string; replacement: string; label: string }> = [];
  for (const block of monetaryBlocks(text)) {
    if (block.table) continue;
    const labels = citedLabels(block.text), hits = evidence.filter(hit => labels.has(hit.label));
    if (!hits.length || new Set(hits.map(hit => hit.source.id)).size !== 1 || [...labels].some(label => !hits.some(hit => hit.label === label))) continue;
    for (const match of block.text.matchAll(expression)) {
      if (hypotheticalAt(block.text, match.index!)) continue;
      const sourceCurrency = match[6] === "美元" ? "USD" : "CNY", targetCurrency = match[9] === "美元" ? "USD" : "CNY";
      if (sourceCurrency !== targetCurrency) continue;
      const a = value(match[1]), b = value(match[3]), result = value(match[4]), factor = factors[match[5]];
      if (!same(match[2] === "+" ? a + b : a - b, result)) continue;
      const proof = hits.find(hit => !hit.chunk.anchor.needsReview && (hit.chunk.anchor.method !== "ocr" || (hit.chunk.anchor.confidence ?? 0) >= 80) && [a, b].every(operand => supportedAmounts(hit).some(amount => amount.currency === sourceCurrency && amount.factor === factor && amount.values.length === 1 && same(amount.values[0], operand))));
      if (!proof) continue;
      const expected = Number((result * factor / factors[match[8]]).toPrecision(12));
      if (!Number.isFinite(expected) || same(value(match[7]), expected)) continue;
      const tail = new RegExp(`(${number})\\s*(?:${unit})\\s*(?:${currency})$`, "u").exec(match[0])!;
      edits.push({ at: block.start + match.index! + tail.index, digits: match[7], replacement: String(expected), label: proof.label });
    }
  }
  let output = text;
  for (const edit of edits.sort((a,b) => b.at-a.at).slice(0, 24-corrections.length)) {
    output = output.slice(0, edit.at) + edit.replacement + output.slice(edit.at + edit.digits.length);
    corrections.push(`Unit corrected using [${edit.label}]: ${edit.digits} → ${edit.replacement} (arithmetic equivalence revalidated from cited same-unit operands).`);
  }
  return output;
}

/** Reconcile a nearby repetition/calculation with verified cited operands.
 * Earlier generated text supplies labels/layout only; every fact is re-proved from
 * current originals. No arbitrary uncited claim or economic comparison is inferred. */
function repairRepeatedCalculations(text: string, evidence: ChatEvidence[], corrections: string[]): string {
  interface Fact { value: number; factor: number; currency: string; label: string; sourceId: string; derived: boolean; keys: string[] }
  const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.005, Math.abs(b) * 1e-10);
  const keys = (block: string, at: number) => {
    const local = block.slice(0, at).split(/[，,;；。\n]/u).at(-1)!.slice(-100);
    return [...local.matchAll(/[A-Za-z][A-Za-z0-9_₂₀-]{1,30}/gu)].map(match => match[0].toLowerCase()).filter(key => !/^(?:cny|rmb|usd|us|billion|million|trillion|the|of|is|and|total|loss|losses)$/u.test(key));
  };
  let previous: Fact[] = [];
  const edits: Array<{ at: number; raw: string; replacement: string; label: string; reason: string }> = [];
  for (const block of monetaryBlocks(text)) {
    if (/^\s*(?:#{1,6}\s|\*\*[^*\n]+\*\*\s*$)/u.test(block.text)) previous = [];
    if (block.table) { previous = []; continue; }
    const current: Fact[] = [];
    const subtraction = /相减|差额|少(?:损失)?\s*\d|\bdifference\b|\bsubtract|\bless\s+than\b/iu.test(block.text);
    const addition = /相加|\bsum\b|\badd/iu.test(block.text) && /得到|得出|合计|总共|\b(?:gives|equals|total)\b|[=＝]/iu.test(block.text);
    for (const claim of blockAmounts(block)) {
      if (claim.values.length !== 1 || hypotheticalAt(block.text, claim.start)) continue;
      const labels = monetaryLabels(block, claim.start, claim.raw.length), entityKeys = keys(block.text, claim.start);
      const originals = evidence.filter(hit => labels.has(hit.label) && !hit.chunk.anchor.needsReview && (hit.chunk.anchor.method !== "ocr" || (hit.chunk.anchor.confidence ?? 0) >= 80)).flatMap(hit => [...supportedAmounts(hit), ...(subtraction ? subtractionAmounts(hit) : [])].map(amount => ({ amount, label: hit.label, sourceId: hit.source.id })));
      const verified = originals.filter(({amount}) => amount.values.length === 1 && amount.currency === claim.currency && same(amount.values[0] * amount.factor, claim.values[0] * claim.factor));
      if (verified.length) {
        const {amount, label, sourceId} = verified[0];
        current.push({ value: amount.values[0], factor: amount.factor, currency: amount.currency, label, sourceId, derived: !!amount.derived, keys: entityKeys });
        continue;
      }
      if (labels.size || !previous.length || !/[亿万]/u.test(claim.raw)) continue;
      const candidates: Array<{ value: number; label: string; reason: string }> = [];
      for (const fact of previous) if (fact.currency === claim.currency && same(fact.value, claim.values[0]) && fact.keys.some(key => entityKeys.includes(key))) candidates.push({value: fact.value * fact.factor, label: fact.label, reason: "repeated value revalidated from cited original"});
      if (addition) {
        const differences = previous.filter((fact, i) => fact.derived && previous.findIndex(other => other.derived && other.sourceId === fact.sourceId && same(other.value * other.factor, fact.value * fact.factor)) === i);
        for (let i = 0; i < differences.length; i++) for (let j = i + 1; j < differences.length; j++) {
          const a = differences[i], b = differences[j];
          if (a.sourceId === b.sourceId && a.currency === claim.currency && b.currency === claim.currency && a.factor === b.factor && same(a.value + b.value, claim.values[0])) candidates.push({value: (a.value + b.value) * a.factor, label: a.label, reason: "sum of cited same-unit differences; arithmetic only"});
        }
      }
      if (!candidates.length || candidates.some(candidate => !same(candidate.value, candidates[0].value)) || same(candidates[0].value, claim.values[0] * claim.factor)) continue;
      const digits = Number((candidates[0].value / claim.factor).toPrecision(12)).toString();
      edits.push({at: block.start + claim.start, raw: claim.raw, replacement: claim.raw.replace(claim.digits[0], digits), label: candidates[0].label, reason: candidates[0].reason});
    }
    if (blockAmounts(block).length || /^\s*(?:#{1,6}\s|\*\*)/u.test(block.text)) previous = current;
  }
  let output = text;
  for (const edit of edits.sort((a,b)=>b.at-a.at).slice(0,24-corrections.length)) {
    output = output.slice(0,edit.at)+edit.replacement+output.slice(edit.at+edit.raw.length);
    corrections.push(`Unit corrected using [${edit.label}]: ${edit.raw.trim()} → ${edit.replacement.trim()} (${edit.reason}).`);
  }
  return output;
}

/** Symbolic USD -> CNY table columns use a fixed, unassigned e (CNY/USD).
 * Only compute from an exact cited original, never from another generated value alone. */
function repairTableConversions(text: string, evidence: ChatEvidence[], corrections: string[]): string {
  let output = text;
  for (const block of monetaryBlocks(text).reverse()) {
    if (!block.table || hypotheticalAt(block.text, block.text.length)) continue;
    const cells = tableCells(block.text), headers = block.table.headers;
    if (cells.length !== headers.length) continue;
    const target = headers.findIndex(header => /人民币|\bCNY\b|\bRMB\b/iu.test(header));
    if (target < 0) continue;
    // The target unit may appear in each cell or once in the column heading.
    const targetUnit = (cells[target].match(/万亿|千亿|百亿|百万|亿|万/u) ?? headers[target].match(/万亿|千亿|百亿|百万|亿|万/u))?.[0];
    if (!targetUnit) continue;
    const sourceCells = blockAmounts(block).filter(amount => amount.currency === "USD");
    const coefficients = [...cells[target].matchAll(/([+−-]?\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:\\times\s*|\*\s*)?e\b/gu)];
    if (sourceCells.length !== coefficients.length || !sourceCells.length || sourceCells.some(amount => amount.values.length !== 1)) continue;
    const labels = monetaryLabels(block, 0, block.text.length);
    const hits = evidence.filter(hit => labels.has(hit.label) && !hit.chunk.anchor.needsReview && (hit.chunk.anchor.method !== "ocr" || (hit.chunk.anchor.confidence ?? 0) >= 80));
    if (!/\[S\d+\]/u.test(block.text) && new Set(hits.map(hit => hit.source.id)).size !== 1) continue;
    const originals = hits.flatMap(supportedAmounts);
    if (!sourceCells.every(amount => originals.some(original => original.currency === "USD" && original.values.length === 1 && Math.abs(original.values[0] * original.factor - amount.values[0] * amount.factor) < Math.max(1, Math.abs(amount.values[0] * amount.factor) * 1e-8)))) continue;
    let cell = cells[target];
    for (let i = coefficients.length - 1; i >= 0; i--) {
      const coefficient = coefficients[i], expected = Number((sourceCells[i].values[0] * sourceCells[i].factor / factors[targetUnit]).toPrecision(12));
      const actual = Number(coefficient[1].replace(/,/g, "").replace("−", "-"));
      if (actual === expected || corrections.length >= 24) continue;
      cell = cell.slice(0, coefficient.index!) + coefficient[0].replace(coefficient[1], String(expected)) + cell.slice(coefficient.index! + coefficient[0].length);
      corrections.push(`Unit corrected using cited table original: ${coefficient[0]} → ${expected}e (${targetUnit}元人民币; e CNY/USD).`);
    }
    if (cell === cells[target]) continue;
    // Locate this particular column even if two cells contain identical text.
    const trimmed = block.text.trim(), prefix = trimmed.startsWith("|") ? 1 : 0;
    const at = block.start + block.text.indexOf(trimmed) + prefix + cells.slice(0, target).reduce((size, value) => size + value.length + 1, 0);
    output = output.slice(0, at) + cell + output.slice(at + cells[target].length);
  }
  return output;
}
