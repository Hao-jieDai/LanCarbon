const fs = require("node:fs");
const path = require("node:path");
const target = path.resolve(__dirname, "../public/ocr");
fs.mkdirSync(path.join(target, "core"), { recursive: true });
fs.mkdirSync(path.join(target, "lang"), { recursive: true });
fs.copyFileSync(path.resolve(__dirname, "../node_modules/tesseract.js/dist/worker.min.js"), path.join(target, "worker.min.js"));
// Embedded-WASM variants need no extra binary fetch; all supported CPU variants are local.
for (const variant of ["", "simd-", "relaxedsimd-"]) fs.copyFileSync(path.resolve(__dirname, `../node_modules/tesseract.js-core/tesseract-core-${variant}lstm.wasm.js`), path.join(target, "core", `tesseract-core-${variant}lstm.wasm.js`));
for (const language of ["eng", "chi_sim"]) fs.copyFileSync(path.resolve(__dirname, `../node_modules/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`), path.join(target, "lang", `${language}.traineddata.gz`));
for (const packageName of ["tesseract.js", "tesseract.js-core"]) {
 const source = path.resolve(__dirname, `../node_modules/${packageName}`);
 const license = ["LICENSE", "LICENSE.md", "LICENSE.txt"].find(name => fs.existsSync(path.join(source, name)));
 if (license) fs.copyFileSync(path.join(source, license), path.join(target, `${packageName}-LICENSE.txt`));
}
fs.writeFileSync(path.join(target, "NOTICE.txt"), "Local OCR uses Tesseract.js / Tesseract (Apache-2.0), English and Simplified Chinese tessdata (Apache-2.0). No document or page image is sent to an OCR service.\nhttps://github.com/naptha/tesseract.js\nhttps://github.com/tesseract-ocr/tessdata_best\n");
