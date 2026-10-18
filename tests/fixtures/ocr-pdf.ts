/** Synthetic JPEG pages plus one real text page; no personal research documents enter tests. */
export function scannedPdfFixture(images: Buffer[]): Buffer {
  const objects = [Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"), Buffer.alloc(0), Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")], kids: number[] = [];
  for (const image of images) {
    const number = objects.length + 1, draw = "q 595 0 0 842 0 0 cm /Scan Do Q"; kids.push(number);
    objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Scan ${number + 2} 0 R >> >> /Contents ${number + 1} 0 R >>`), Buffer.from(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`), Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1190 /Height 1684 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, Buffer.from("\nendstream")]));
  }
  const number = objects.length + 1, text = "BT /F1 18 Tf 50 740 Td (Native policy evidence stays selectable.) Tj ET"; kids.push(number);
  objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${number + 1} 0 R >>`), Buffer.from(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`));
  objects[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map(n => `${n} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  const chunks = [Buffer.from("%PDF-1.7\n")], offsets: number[] = []; let size = chunks[0].length;
  for (const [index, object] of objects.entries()) { offsets.push(size); const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]); chunks.push(chunk); size += chunk.length; }
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`)); return Buffer.concat(chunks);
}
