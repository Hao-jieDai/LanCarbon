const fs = require("node:fs");
const path = require("node:path");
const target = path.resolve(__dirname, "../public/pdfjs");
fs.mkdirSync(target, { recursive: true });
for (const name of ["cmaps", "standard_fonts", "wasm", "iccs"]) fs.cpSync(path.resolve(__dirname, "../node_modules/pdfjs-dist", name), path.join(target, name), { recursive: true });
fs.copyFileSync(path.resolve(__dirname, "../node_modules/pdfjs-dist/LICENSE"), path.join(target, "LICENSE"));

const generated = path.resolve(__dirname, "../src/generated");
fs.mkdirSync(generated, { recursive: true });
fs.cpSync(path.resolve(__dirname, "../node_modules/pdfjs-dist/web/images"), path.join(target, "images"), { recursive: true });
const css = fs.readFileSync(path.resolve(__dirname, "../node_modules/pdfjs-dist/web/pdf_viewer.css"), "utf8").replaceAll(":root", ":scope").replace(/url\((["']?)images\//g, "url($1/pdfjs/images/");
fs.writeFileSync(path.join(generated, "pdf-viewer.css"), "/* Scoped Mozilla PDF.js styles; see public/pdfjs/LICENSE. */\n@scope (.pdf-reader) {\n" + css + "\n}\n");