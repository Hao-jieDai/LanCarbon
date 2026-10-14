import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cnyUsageCost, emptyUsageTotals, formatCnyCost, localUsageDay, type AIUsageActivity, type AIUsageQuery, type AIUsageTotals } from "../shared/aiUsage";

// Calendar arithmetic uses UTC to avoid skipped or repeated dates during DST.
export function calendarDays(from: string, to: string): Array<string | null> {
  if (from > to) return [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const cells: Array<string | null> = Array.from({ length: (cursor.getUTCDay() + 6) % 7 }, () => null);
  for (let count = 0; cursor.toISOString().slice(0, 10) <= to && count < 366; count++) {
    cells.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}
type Hover = { label: string; totals: AIUsageTotals; x: number; y: number };
export function AIUsageHeatmap({ activity, query, usdToCny, mode, onMode }: { activity: AIUsageActivity[]; query: AIUsageQuery; usdToCny: number; mode: "hourly" | "daily"; onMode: (mode: "hourly" | "daily") => void }) {
  const from = query.from ?? activity[0]?.day ?? query.to ?? localUsageDay();
  const to = query.to ?? activity.at(-1)?.day ?? localUsageDay();
  const [day, setDay] = useState(to), [year, setYear] = useState(Number(to.slice(0, 4)));
  const [hover, setHover] = useState<Hover>();
  useEffect(() => { setDay(to); setYear(Number(to.slice(0, 4))); setHover(undefined); }, [from, to, mode]);
  const activeDay = day < from ? from : day > to ? to : day;
  const activeYear = Math.max(Number(from.slice(0, 4)), Math.min(year, Number(to.slice(0, 4))));
  const yearFrom = `${String(activeYear).padStart(4, "0")}-01-01`, yearTo = `${String(activeYear).padStart(4, "0")}-12-31`;
  const cells = calendarDays(from > yearFrom ? from : yearFrom, to < yearTo ? to : yearTo);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const hours = activity.find(value => value.day === activeDay)?.hours ?? [];
  const maximum = (mode === "hourly" ? hours.map(value => value.summary.totalTokens) : activity.map(value => value.summary.totalTokens)).reduce((maximum, value) => Math.max(maximum, value), 0);
  const show = (element: HTMLButtonElement, label: string, totals: AIUsageTotals) => {
    const rect = element.getBoundingClientRect();
    setHover({ label, totals, x: Math.max(10, Math.min(rect.left, window.innerWidth - 250)), y: Math.max(10, rect.bottom + 120 > window.innerHeight ? rect.top - 112 : rect.bottom + 8) });
  };
  const cell = (key: string, label: string, totals: AIUsageTotals) => {
    const level = maximum && totals.totalTokens ? Math.min(4, Math.max(1, Math.ceil(Math.log1p(totals.totalTokens) / Math.log1p(maximum) * 4))) : 0;
    return <button key={key} type="button" className={`usage-heat-cell level-${level}${totals.unknownTokens ? " incomplete" : ""}`} data-day={mode === "daily" ? key : activeDay} data-hour={mode === "hourly" ? key : undefined} data-tokens={totals.totalTokens} aria-label={`${label}: ${totals.totalTokens.toLocaleString("en-US")} tokens`} onMouseEnter={event => show(event.currentTarget, label, totals)} onMouseLeave={() => setHover(undefined)} onFocus={event => show(event.currentTarget, label, totals)} onBlur={() => setHover(undefined)}/>;
  };
  const hoveredCost = hover ? cnyUsageCost(hover.totals, usdToCny) : undefined;
  return <section className="usage-activity" aria-label="Token activity">
    <div className="usage-activity-heading"><h2>Token activity</h2><div className="usage-activity-controls"><button className="text-button" aria-pressed={mode === "hourly"} onClick={() => onMode("hourly")}>Hourly</button><button className="text-button" aria-pressed={mode === "daily"} onClick={() => onMode("daily")}>Daily</button>
      {mode === "hourly" ? <input aria-label="Heatmap day" type="date" min={from} max={to} value={activeDay} onChange={event => { if (event.target.value) setDay(event.target.value); setHover(undefined); }}/> : from.slice(0, 4) !== to.slice(0, 4) ? <input aria-label="Heatmap year" type="number" min={Number(from.slice(0, 4))} max={Number(to.slice(0, 4))} value={activeYear} onChange={event => { if (event.target.value) setYear(Number(event.target.value)); setHover(undefined); }}/> : <span>{activeYear}</span>}
    </div></div>
    {mode === "hourly" ? <div className="usage-hours">{Array.from({ length: 24 }, (_, hour) => <div key={hour}>{cell(String(hour), `${activeDay} ${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59`, hours.find(value => value.hour === hour)?.summary ?? emptyUsageTotals())}<span>{String(hour).padStart(2, "0")}</span></div>)}</div> : <div className="usage-days-scroll"><div className="usage-day-labels">{["Mon", "", "Wed", "", "Fri", "", ""].map((label, index) => <span key={index}>{label}</span>)}</div><div>
      <div className="usage-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--heat-cell))` }}>{weeks.map((week, index) => { const first = week.find(day => day && (index === 0 || day.slice(8) === "01")); return <span key={index}>{first ? new Date(`${first}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) : ""}</span>; })}</div>
      <div className="usage-days" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--heat-cell))` }}>{cells.map((day, index) => day ? cell(day, day, activity.find(value => value.day === day)?.summary ?? emptyUsageTotals()) : <span className="usage-heat-blank" key={`blank-${index}`}/>)}</div>
    </div></div>}
    <div className="usage-activity-legend"><span>Local time · Tokens</span><div><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`usage-heat-cell level-${level}`}/>)}<span>More</span></div></div>
    {hover && createPortal(<div className="usage-heat-tooltip" role="tooltip" style={{ left: hover.x, top: hover.y }}><strong>{hover.label}</strong><span>Tokens {hover.totals.totalTokens.toLocaleString("en-US")}</span><span>Costs {hover.totals.requests ? hoveredCost === undefined ? "Unknown" : `≈ ${formatCnyCost(hoveredCost)}` : formatCnyCost(0)}</span>{(hover.totals.unknownTokens > 0 || hover.totals.unknownCosts > 0) && <small>Known data only · {hover.totals.unknownTokens} missing tokens · {hover.totals.unknownCosts} unknown costs</small>}</div>, document.body)}
  </section>;
}
