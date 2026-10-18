import { BrowserWindow, session } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assetReferences } from "../src/shared/assets";
import type { WorkspaceFile } from "../src/shared/types";
import type { AssetStore } from "./assets";
import type { AIChat, ChatPdfOptions } from "../src/shared/ai";

export function pdfFileName(title: string): string {
  let name = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().replace(/[. ]+$/g, "").slice(0, 110).replace(/[. ]+$/g, "") || "Untitled Note";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `Note ${name}`;
  return `${name}.pdf`;
}

export async function exportPagePdf(workspace: WorkspaceFile, noteId: string, destination: string, assets: AssetStore): Promise<string[]> {
  const note = workspace.notes.find(item => item.id === noteId);
  if (!note) throw new Error("The selected page no longer exists");
  const book = workspace.books.find(item => Object.values(item.pages).some(page => page.noteId === noteId));
  const documents = (book ? Object.values(book.pages).filter(page => page.sourceType === "markdown") : [{ noteId }]).flatMap(page => {
    const source = workspace.notes.find(item => item.id === page.noteId);
    return source ? [{ id: source.id, title: source.title, content: source.content, ...("exportPath" in page ? { path: page.exportPath, label: page.metadata.label } : {}), bibliography: book?.settings.bibliography?.flatMap(item => item.entries) }] : [];
  });
  const current = documents.find(item => item.id === noteId);
  if (!current) throw new Error("PDF export supports Markdown pages only");
  const resources: Record<string, { name: string; url?: string }> = {};
  for (const id of new Set(assetReferences(note.content).map(ref => ref.id))) {
    const { asset, bytes } = await assets.read(id).catch(() => { throw new Error(`Missing or damaged resource: ${id}. Repair the resource before exporting PDF.`); });
    resources[id] = { name: asset.name, ...(/^image\/(png|jpeg|gif|webp)$/.test(asset.mime) ? { url: `data:${asset.mime};base64,${bytes.toString("base64")}` } : {}) };
  }
  return printPdf("renderLanCarbonPdf", { current, documents, assets: resources }, destination);
}

export async function exportChatPdf(chat: AIChat, options: ChatPdfOptions, destination: string): Promise<string[]> {
  if (!chat.messages.length) throw Error("This conversation has no messages to export.");
  if (chat.messages.some(message => message.status === "streaming")) throw Error("Wait for the reply to finish or stop it before exporting PDF.");
  return printPdf("renderLanCarbonChatPdf", { chat, options }, destination);
}

async function printPdf(renderer: "renderLanCarbonPdf" | "renderLanCarbonChatPdf", payload: unknown, destination: string): Promise<string[]> {
  const isolated = session.fromPartition("pdf-offline-export", { cache: false });
  const printWindow = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false, session: isolated } });
  // Printing is offline, including untrusted chat Markdown. Never load a remote image/font.
  const devOrigin = process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL).origin : undefined;
  printWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    callback({ cancel: !["file:", "data:", "blob:"].includes(url.protocol) && url.origin !== devOrigin });
  });
  printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  printWindow.webContents.on("will-navigate", event => event.preventDefault());
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
  try {
    const url = process.env.VITE_DEV_SERVER_URL;
    if (url) await printWindow.loadURL(new URL("pdf.html", `${url}/`).href);
    else await printWindow.loadFile(path.join(__dirname, "../../dist/pdf.html"));
    const rendered = await printWindow.webContents.executeJavaScript(`window.${renderer}(${JSON.stringify(payload)})`) as { warnings: string[] };
    const bytes = await printWindow.webContents.printToPDF({ pageSize: "A4", printBackground: true, margins: { top: 0.65, bottom: 0.65, left: 0.65, right: 0.65 }, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="font-size:9px;color:#666;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>', generateTaggedPDF: true, generateDocumentOutline: true });
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    await fs.rename(temporary, destination);
    return rendered.warnings;
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
    await fs.unlink(temporary).catch(() => undefined);
  }
}
