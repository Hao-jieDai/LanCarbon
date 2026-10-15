export const MAX_READER_TABS = 10;
export interface ReaderTab { id: string; name: string; format: "pdf" | "epub" }
export function validReaderId(value: unknown): value is string { return typeof value === "string" && /^(?:import:)?[a-f0-9]{64}\.(?:pdf|epub)$/.test(value); }
export function savedReaderTabs(value: unknown): ReaderTab[] {
  if (!Array.isArray(value)) return [];
  const result: ReaderTab[] = [];
  for (const tab of value) if (tab && validReaderId(tab.id) && ["pdf","epub"].includes(tab.format) && typeof tab.name === "string" && tab.name.length <= 200 && !result.some(other=>other.id===tab.id) && result.length<MAX_READER_TABS) result.push({id:tab.id,name:tab.name,format:tab.format});
  return result;
}
export function addReaderTab(tabs: ReaderTab[], tab: ReaderTab): ReaderTab[] {
  if(tabs.some(other=>other.id===tab.id))return tabs.map(other=>other.id===tab.id?tab:other);
  if(tabs.length>=MAX_READER_TABS)throw Error("Up to 10 files can be open. Close a tab before opening another file.");
  return [...tabs,tab];
}
