export function readerPdfFixture(count = 4): Buffer {
  const objects = ["<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R >>", `<< /Type /Pages /Kids [${Array.from({length:count},(_,i)=>`${6+i*2} 0 R`).join(" ")}] /Count ${count} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Outlines /First 5 0 R /Last 5 0 R /Count 1 >>", "<< /Title (Research section) /Parent 4 0 R /Dest [8 0 R /Fit] >>"];
  for(let page=1;page<=count;page++) { const stream=`BT /F1 16 Tf 50 740 Td (Climate investment page ${page}.) Tj 0 -35 Td (Research evidence and energy transition.) Tj ET`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${7+(page-1)*2} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`); }
  let raw="%PDF-1.7\n";const offsets:number[]=[];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(raw));raw+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(raw);raw+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return Buffer.from(raw);
}

export function imagePdfFixture(): Buffer {
  const image=Buffer.alloc(1200*1200*3,180),draw="q 500 0 0 500 50 250 cm /Im0 Do Q";
  const objects=[Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>"),Buffer.from(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`),Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1200 /Height 1200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${image.length} >>\nstream\n`),image,Buffer.from("\nendstream")])];
  const chunks=[Buffer.from("%PDF-1.7\n")],offsets:number[]=[];let size=chunks[0].length;for(let i=0;i<objects.length;i++){offsets.push(size);const part=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),objects[i],Buffer.from("\nendobj\n")]);chunks.push(part);size+=part.length;}
  chunks.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));return Buffer.concat(chunks);
}
