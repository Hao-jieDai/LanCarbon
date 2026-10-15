import { deflateRawSync } from "node:zlib";
export function pdfFixture(text = "Climate change affects investment."): Buffer {
  const stream = `BT /F1 16 Tf 72 740 Td (${text.replace(/[()\\]/g, " ")}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let source = "%PDF-1.7\n"; const offsets: number[] = [];
  for (let index = 0; index < objects.length; index++) { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function epubFixture(overrides: Record<string,string|Buffer> = {}, compressed = false): Buffer {
  const files = {
    mimetype: "application/epub+zip",
    "META-INF/container.xml": '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    "OEBPS/content.opf": '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">lancarbon-fixture</dc:identifier><dc:title>Research reading</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-10-15T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/></spine></package>',
    "OEBPS/nav.xhtml": '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Climate investment</a></li></ol></nav></body></html>',
    "OEBPS/chapter.xhtml": '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Climate investment</title></head><body><h1>Climate investment</h1><p>Climate change affects investment.</p></body></html>'
  };
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, text] of Object.entries({...files,...overrides})) {
    const filename = Buffer.from(name), bytes = Buffer.from(text), crc = crc32(bytes);
    const packed = compressed && name !== "mimetype" ? deflateRawSync(bytes) : bytes, method = packed === bytes ? 0 : 8;
    const header = Buffer.alloc(30);header.writeUInt16LE(method,8); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    locals.push(header, filename, packed);
    const directory = Buffer.alloc(46);directory.writeUInt16LE(method,10); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(packed.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename); offset += header.length + filename.length + packed.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys({...files,...overrides}).length, 8); end.writeUInt16LE(Object.keys({...files,...overrides}).length, 10); end.writeUInt32LE(Buffer.concat(central).length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
