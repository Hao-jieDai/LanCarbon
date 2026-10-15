import { epubFixture } from "./library";
export function readerEpubFixture(title="Research reading") {
  return epubFixture({
    "OEBPS/content.opf":`<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="two" href="chapter2.xhtml" media-type="application/xhtml+xml"/><item id="image" href="image.png" media-type="image/png"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>`,
    "OEBPS/nav.xhtml":'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Climate investment</a></li><li><a href="chapter2.xhtml">Energy transition</a><ol><li><a href="chapter2.xhtml#evidence">Evidence</a></li></ol></li></ol></nav></body></html>',
    "OEBPS/chapter.xhtml":`<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>${title}</h1><p>Climate change affects investment.</p><img src="image.png" alt="Local diagram"/><a href="chapter2.xhtml#evidence">Go to evidence</a><table><tr><th>Year</th><th>Cost</th></tr><tr><td>2030</td><td>20</td></tr></table>${Array.from({length:100},(_,i)=>`<p>Climate investment paragraph ${i}. Reading continues locally.</p>`).join("")}</body></html>`,
    "OEBPS/chapter2.xhtml":'<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Energy transition</h1><p id="evidence">Energy transition evidence is available here.</p>'+Array.from({length:80},(_,i)=>`<p>Evidence paragraph ${i}. Stable reading position.</p>`).join("")+'</body></html>',
    "OEBPS/image.png":Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==","base64")
  });
}
