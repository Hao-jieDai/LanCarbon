import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cnyUsageCost, emptyUsageTotals, formatCnyCost, localUsageDay, type AIUsageActivity, type AIUsageQuery, type AIUsageTotals } from "../shared/aiUsage";
import { DatePicker } from "./DatePicker";

// Calendar arithmetic uses UTC to avoid skipped or repeated dates during DST.
export function calendarDays(from: string, to: string): Array<string | null> {
  if (from > to) return [];
  const cursor = new Date(from + "T12:00:00Z");
  const cells: Array<string | null> = Array.from({ length: (cursor.getUTCDay() + 6) % 7 }, () => null);
  for (let count = 0; cursor.toISOString().slice(0, 10) <= to && count < 366; count++) {
    cells.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

type Hover = { label: string; totals: AIUsageTotals; x: number; y: number };
export function AIUsageHeatmap({ query, usdToCny, mode, onMode, visible }: { query: AIUsageQuery; usdToCny: number; mode: "hourly" | "daily"; onMode(mode: "hourly" | "daily"): void; visible: boolean }) {
  const [day, setDay] = useState(localUsageDay), [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<{ identity: string; activity: AIUsageActivity[] }>();
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [hover, setHover] = useState<Hover>();
  const revision = useRef(0);
  const from = mode === "hourly" ? day : year + "-01-01", to = mode === "hourly" ? day : year + "-12-31";
  const { providerId, modelId, purpose } = query;
  const identity = JSON.stringify([from, to, providerId, modelId, purpose]);
  const reload = useCallback(async () => {
    const ticket = ++revision.current; setBusy(true);
    try {
      const result = await window.notesDesktop.ai!.usage({ from, to, providerId, modelId, purpose });
      if (ticket !== revision.current) return;
      if (!result.ok) throw Error(result.error);
      setData({ identity, activity: result.usage.activity }); setError("");
    } catch (error) { if (ticket === revision.current) setError(error instanceof Error ? error.message : "Could not load local activity."); }
    finally { if (ticket === revision.current) setBusy(false); }
  }, [from, to, providerId, modelId, purpose, identity]);
  useEffect(() => {
    if (!visible) return;
    void reload(); let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.notesDesktop.ai!.onUsageChanged(() => { clearTimeout(timer); timer = setTimeout(() => void reload(), 150); });
    return () => { revision.current++; clearTimeout(timer); unsubscribe(); };
  }, [visible, reload]);
  useEffect(() => setHover(undefined), [identity, mode, usdToCny]);
  const activity = data?.identity === identity ? data.activity : [];
  const cells = calendarDays(year + "-01-01", year + "-12-31");
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const hours = activity.find(value => value.day === day)?.hours ?? [];
  const maximum = (mode === "hourly" ? hours.map(value => value.summary.totalTokens) : activity.map(value => value.summary.totalTokens)).reduce((maximum, value) => Math.max(maximum, value), 0);
  const show = (element: HTMLButtonElement, label: string, totals: AIUsageTotals) => {
    const rect = element.getBoundingClientRect();
    setHover({ label, totals, x: Math.max(10, Math.min(rect.left, window.innerWidth - 250)), y: Math.max(10, rect.bottom + 120 > window.innerHeight ? rect.top - 112 : rect.bottom + 8) });
  };
  const cell = (key: string, label: string, totals: AIUsageTotals) => {
    const level = maximum && totals.totalTokens ? Math.min(4, Math.max(1, Math.ceil(Math.log1p(totals.totalTokens) / Math.log1p(maximum) * 4))) : 0;
    return <button key={key} type="button" className={"usage-heat-cell level-" + level + (totals.unknownTokens ? " incomplete" : "")} data-day={mode === "daily" ? key : day} data-hour={mode === "hourly" ? key : undefined} data-tokens={totals.totalTokens} aria-label={label + ": " + totals.totalTokens.toLocaleString("en-US") + " tokens"} onMouseEnter={event => show(event.currentTarget, label, totals)} onMouseLeave={() => setHover(undefined)} onFocus={event => show(event.currentTarget, label, totals)} onBlur={() => setHover(undefined)}/>;
  };
  const hoveredCost = hover ? cnyUsageCost(hover.totals, usdToCny) : undefined;
  return <section className="usage-activity" aria-label="Token activity" aria-busy={busy}>
    <div className="usage-activity-heading"><h2>Token activity</h2><div className="usage-activity-controls"><button className="text-button" aria-pressed={mode === "hourly"} onClick={() => onMode("hourly")}>Hourly</button><button className="text-button" aria-pressed={mode === "daily"} onClick={() => onMode("daily")}>Daily</button>
      {mode === "hourly" ? <DatePicker label="Heatmap day" required value={day} onChange={setDay}/> : <input aria-label="Heatmap year" type="number" min="1900" max="9999" value={year} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1900 && value <= 9999) setYear(value); }}/>}
    </div></div>
    {error && <p role="alert" className="usage-warning">{error}</p>}
    {mode === "hourly" ? <div className="usage-hours">{Array.from({ length: 24 }, (_, hour) => <div key={hour}>{cell(String(hour), day + " " + String(hour).padStart(2, "0") + ":00–" + String(hour).padStart(2, "0") + ":59", hours.find(value => value.hour === hour)?.summary ?? emptyUsageTotals())}<span>{String(hour).padStart(2, "0")}</span></div>)}</div> : <div className="usage-days-scroll"><div className="usage-day-labels">{["Mon", "", "Wed", "", "Fri", "", ""].map((label, index) => <span key={index}>{label}</span>)}</div><div>
      <div className="usage-months" style={{ gridTemplateColumns: "repeat(" + weeks.length + ", var(--heat-cell))" }}>{weeks.map((week, index) => { const first = week.find(day => day && (index === 0 || day.slice(8) === "01")); return <span key={index}>{first ? new Date(first + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) : ""}</span>; })}</div>
      <div className="usage-days" style={{ gridTemplateColumns: "repeat(" + weeks.length + ", var(--heat-cell))" }}>{cells.map((date, index) => date ? cell(date, date, activity.find(value => value.day === date)?.summary ?? emptyUsageTotals()) : <span className="usage-heat-blank" key={"blank-" + index}/>)}</div>
    </div></div>}
    <div className="usage-activity-legend"><span>Local time · Tokens</span><div><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={"usage-heat-cell level-" + level}/>)}<span>More</span></div></div>
    {hover && createPortal(<div className="usage-heat-tooltip" role="tooltip" style={{ left: hover.x, top: hover.y }}><strong>{hover.label}</strong><span>Tokens {hover.totals.totalTokens.toLocaleString("en-US")}</span><span>Costs {hover.totals.requests ? hoveredCost === undefined ? "Unknown" : "≈ " + formatCnyCost(hoveredCost) : formatCnyCost(0)}</span>{(hover.totals.unknownTokens > 0 || hover.totals.unknownCosts > 0) && <small>Known data only · {hover.totals.unknownTokens} missing tokens · {hover.totals.unknownCosts} unknown costs</small>}</div>, document.body)}
  </section>;
}
