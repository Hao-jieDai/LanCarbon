import { createReadStream, promises as fs } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

interface RunningWebsite { root: string; server: Server; url: string }

async function resolveRequest(root: string, requestUrl: string): Promise<string | null> {
  let pathname: string;
  try { pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname); }
  catch { return null; }
  const target = path.resolve(root, `.${pathname.replaceAll("/", path.sep)}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  const stat = await fs.stat(target).catch(() => null);
  if (stat?.isDirectory()) {
    const index = path.join(target, "index.html");
    return (await fs.stat(index).catch(() => null))?.isFile() ? index : null;
  }
  if (stat?.isFile()) return target;
  if (!path.extname(target)) {
    const html = `${target}.html`;
    if ((await fs.stat(html).catch(() => null))?.isFile()) return html;
  }
  return null;
}

export class WebsiteServerManager {
  private readonly websites = new Map<string, RunningWebsite>();

  async serve(bookId: string, htmlPath: string): Promise<string> {
    const root = path.resolve(htmlPath);
    if (!(await fs.stat(path.join(root, "index.html")).catch(() => null))?.isFile()) throw new Error("The built website does not contain index.html");
    const current = this.websites.get(bookId);
    if (current?.root === root && current.server.listening) return current.url;
    if (current) await new Promise<void>(resolve => current.server.close(() => resolve()));
    const server = createServer((request, response) => {
      void resolveRequest(root, request.url ?? "/").then(file => {
        if (!file) { response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Not found"); return; }
        response.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-cache" });
        if (request.method === "HEAD") { response.end(); return; }
        createReadStream(file).on("error", () => response.destroy()).pipe(response);
      }).catch(() => { response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Could not read the website"); });
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") { server.close(); throw new Error("Could not allocate a local website address"); }
    const running = { root, server, url: `http://127.0.0.1:${address.port}/` };
    this.websites.set(bookId, running);
    server.once("close", () => { if (this.websites.get(bookId)?.server === server) this.websites.delete(bookId); });
    return running.url;
  }

  url(bookId: string): string | undefined { return this.websites.get(bookId)?.url; }

  async stop(bookId: string): Promise<void> {
    const website = this.websites.get(bookId); if (!website) return;
    await new Promise<void>(resolve => website.server.close(() => resolve()));
  }

  closeAll(): void {
    for (const website of this.websites.values()) website.server.close();
    this.websites.clear();
  }
}
