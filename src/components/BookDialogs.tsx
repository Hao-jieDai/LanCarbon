import { useState } from "react";
import type { Book, BookSettings, PageMetadata } from "../shared/types";

export function CreateBookDialog({ onCreate, onClose }: { onCreate(title: string): void; onClose(): void }) {
  const [title, setTitle] = useState("");
  return <div className="modal-backdrop" role="presentation"><form className="settings-modal compact-modal" aria-label="New Book" spellCheck={false} onSubmit={event => { event.preventDefault(); onCreate(title.trim() || "Untitled Book"); }}>
    <header><h2>New Book</h2><button type="button" className="icon-button" aria-label="Close New Book" onClick={onClose}>×</button></header>
    <label><span className="field-label">Book Name <span className="recommended-mark">(*)</span></span><input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Book Name" autoFocus maxLength={200} placeholder="e.g. Energy Systems Research" value={title} onChange={event => setTitle(event.target.value)} /></label>
    <p className="modal-help">A fixed home page is created now. The myst.yml file is generated when you export to a folder.</p>
    <footer><button type="button" className="text-button modal-button" onClick={onClose}>Cancel</button><button className="new-note compact" type="submit">Create Book</button></footer>
  </form></div>;
}

export function ChooseBookDialog({ books, onChoose, onClose }: { books: Book[]; onChoose(bookId: string): void; onClose(): void }) {
  const [bookId, setBookId] = useState(books[0]?.id ?? "");
  return <div className="modal-backdrop" role="presentation"><form className="settings-modal compact-modal" aria-label="Choose a Book" spellCheck={false} onSubmit={event => { event.preventDefault(); if (bookId) onChoose(bookId); }}>
    <header><h2>Add to Book</h2><button type="button" className="icon-button" aria-label="Close Book chooser" onClick={onClose}>×</button></header>
    <label>Destination Book<select autoFocus aria-label="Destination Book" value={bookId} onChange={event => setBookId(event.target.value)}>{books.map(book => <option key={book.id} value={book.id}>{book.settings.title}</option>)}</select></label>
    <p className="modal-help">The note content will not change. Each note can belong to one Book.</p>
    <footer><button type="button" className="text-button modal-button" onClick={onClose}>Cancel</button><button className="new-note compact" type="submit">Add to Book</button></footer>
  </form></div>;
}

export function BookSettingsDialog({ book, onSave, onClose }: { book: Book; onSave(settings: BookSettings): void; onClose(): void }) {
  const [settings, setSettings] = useState(book.settings);
  const [authorsText, setAuthorsText] = useState(book.settings.authors.map(author => author.name).join(", "));
  const update = (patch: Partial<BookSettings>) => setSettings(current => ({ ...current, ...patch }));
  return <div className="modal-backdrop" role="presentation"><form className="settings-modal" aria-label="Book Settings" spellCheck={false} onSubmit={event => { event.preventDefault(); onSave({ ...settings, title: settings.title.trim(), authors: parseAuthors(authorsText) }); }}>
    <header><h2>Book Settings</h2><button type="button" className="icon-button" aria-label="Close settings" onClick={onClose}>×</button></header>
    <label><span className="field-label">Book title <span className="recommended-mark">(*)</span></span><input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Book title" value={settings.title} onChange={event => update({ title: event.target.value })} /></label>
    <label>Subtitle<input spellCheck={false} autoCorrect="off" autoCapitalize="off" value={settings.subtitle ?? ""} onChange={event => update({ subtitle: event.target.value })} /></label>
    <label>Description<textarea spellCheck={false} autoCorrect="off" autoCapitalize="off" value={settings.description ?? ""} onChange={event => update({ description: event.target.value })} /></label>
    <label>Authors<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Book Authors" placeholder="e.g. Haojie Dai, Jane Smith" value={authorsText} onChange={event => setAuthorsText(event.target.value)} /></label>
    <label>GitHub repository URL<input spellCheck={false} autoCorrect="off" autoCapitalize="off" value={settings.github ?? ""} onChange={event => update({ github: event.target.value })} /></label>
    <label>License<input spellCheck={false} autoCorrect="off" autoCapitalize="off" value={settings.license ?? ""} onChange={event => update({ license: event.target.value })} /></label>
    <label>Keywords<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Book Keywords" placeholder="Separate keywords with commas" value={settings.keywords.join(", ")} onChange={event => update({ keywords: event.target.value.split(/[,，]/).map(value => value.trim()).filter(Boolean) })} /></label>
    <label>Site title<input spellCheck={false} autoCorrect="off" autoCapitalize="off" value={settings.siteTitle ?? ""} onChange={event => update({ siteTitle: event.target.value })} /></label>
    <label>Logo Path<input spellCheck={false} autoCorrect="off" autoCapitalize="off" placeholder="images/logo.png" value={settings.logo ?? ""} onChange={event => update({ logo: event.target.value })} /></label>
    <label>Favicon Path<input spellCheck={false} autoCorrect="off" autoCapitalize="off" placeholder="images/favicon.ico" value={settings.favicon ?? ""} onChange={event => update({ favicon: event.target.value })} /></label>
    <footer><button type="button" className="text-button modal-button" onClick={onClose}>Cancel</button><button className="new-note compact" type="submit">Save Settings</button></footer>
  </form></div>;
}

export function PagePropertiesDialog(props: { exportPath: string; showInToc: boolean; metadata: PageMetadata; onSave(value: { exportPath: string; showInToc: boolean; metadata: PageMetadata }): void; onClose(): void }) {
  const [exportPath, setExportPath] = useState(props.exportPath);
  const [showInToc, setShowInToc] = useState(props.showInToc);
  const [metadata, setMetadata] = useState(props.metadata);
  const [authorsText, setAuthorsText] = useState(props.metadata.authors?.map(author => author.name).join(", ") ?? "");
  const update = (patch: Partial<PageMetadata>) => setMetadata(current => ({ ...current, ...patch }));
  return <div className="modal-backdrop" role="presentation"><form className="settings-modal" aria-label="Page Properties" spellCheck={false} onSubmit={event => { event.preventDefault(); props.onSave({ exportPath: exportPath.trim(), showInToc, metadata: { ...metadata, authors: parseAuthors(authorsText) } }); }}>
    <header><h2>Page Properties</h2><button type="button" className="icon-button" aria-label="Close page properties" onClick={props.onClose}>×</button></header>
    <label><span className="field-label">Export Path <span className="recommended-mark">(*)</span></span><input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Export Path" value={exportPath} onChange={event => setExportPath(event.target.value)} /></label>
    <label className="checkbox-label"><input spellCheck={false} autoCorrect="off" autoCapitalize="off" type="checkbox" checked={showInToc} onChange={event => setShowInToc(event.target.checked)} />Show in table of contents</label>
    <label>Short title<input spellCheck={false} autoCorrect="off" autoCapitalize="off" value={metadata.shortTitle ?? ""} onChange={event => update({ shortTitle: event.target.value })} /></label>
    <label>Description<textarea spellCheck={false} autoCorrect="off" autoCapitalize="off" value={metadata.description ?? ""} onChange={event => update({ description: event.target.value })} /></label>
    <label>Authors<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Page Authors" placeholder="e.g. Haojie Dai, Jane Smith" value={authorsText} onChange={event => setAuthorsText(event.target.value)} /></label>
    <label>Date<input spellCheck={false} autoCorrect="off" autoCapitalize="off" type="date" value={metadata.date ?? ""} onChange={event => update({ date: event.target.value })} /></label>
    <label>Keywords<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Page Keywords" value={metadata.keywords?.join(", ") ?? ""} onChange={event => update({ keywords: event.target.value.split(/[,，]/).map(value => value.trim()).filter(Boolean) })} /></label>
    <label>Label<input spellCheck={false} autoCorrect="off" autoCapitalize="off" value={metadata.label ?? ""} onChange={event => update({ label: event.target.value })} /></label>
    <footer><button type="button" className="text-button modal-button" onClick={props.onClose}>Cancel</button><button className="new-note compact" type="submit">Save Properties</button></footer>
  </form></div>;
}

function parseAuthors(value: string): Array<{ name: string }> {
  return value.split(/[,，]/).map(name => name.trim()).filter(Boolean).map(name => ({ name }));
}

export function DataLocationDialog(props: { path: string; onChange(): void; onOpen(): void; onClose(): void }) {
  return <div className="modal-backdrop" role="presentation"><section className="settings-modal compact-modal" aria-label="Data Location">
    <header><h2>Data Location</h2><button type="button" className="icon-button" aria-label="Close data location" onClick={props.onClose}>×</button></header>
    <p className="modal-help">All Notes, Books, page properties and Markdown source are stored in one local workspace file.</p>
    <label>Current folder<input spellCheck={false} autoCorrect="off" autoCapitalize="off" aria-label="Current data folder" readOnly value={props.path} /></label>
    <p className="modal-help">Changing the folder copies and verifies the workspace before switching. The previous file is retained as a backup.</p>
    <footer><button type="button" className="text-button modal-button" onClick={props.onOpen}>Open Folder</button><button type="button" className="new-note compact" onClick={props.onChange}>Change Location</button></footer>
  </section></div>;
}
