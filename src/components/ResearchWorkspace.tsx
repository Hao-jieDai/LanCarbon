import { RESEARCH_PAGES, type ResearchPage } from "../shared/research";

export function ResearchWorkspace({ page, onOpenSidebar }: { page: ResearchPage; onOpenSidebar(): void }) {
  const selected = RESEARCH_PAGES.find(item => item.id === page)!;
  return <section className="editor-panel foundation-panel" aria-label="Research workspace">
    <header className="editor-toolbar"><button className="icon-button mobile-menu" aria-label="Open workspace list" onClick={onOpenSidebar}>☰</button><span className="foundation-breadcrumb">Research / {selected.label}</span><span className="foundation-status">Coming soon</span></header>
    <article className="foundation-content">
      <p className="foundation-eyebrow">RESEARCH</p><h1>{selected.label}</h1><p className="foundation-description">{selected.description}</p>
      <div className="foundation-card"><span className="foundation-card-icon" aria-hidden="true">◇</span><h2>A place for your research</h2><p>This workspace is ready for upcoming AI and literature tools. {selected.label} is not available yet.</p><p>Your Notes and Books are available from the workspace buttons.</p></div>
    </article>
  </section>;
}
