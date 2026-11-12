const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function extract() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const buf = fs.readFileSync(filePath);

  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    const uint8 = new Uint8Array(buf);
    const loadingTask = pdfjsLib.getDocument({ data: uint8, disableFontFace: true });
    const doc = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str);
      fullText += strings.join(' ') + '\n';
    }
    if (fullText.trim().length > 20) {
      process.stdout.write(fullText);
      process.exit(0);
    }
  } catch (err2) {
    // try fallback
  }

  try {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buf });
    const res = await parser.getText();
    await parser.destroy();
    if (res && res.text && res.text.trim().length > 20) {
      process.stdout.write(res.text);
      process.exit(0);
    }
  } catch (err) {
    process.exit(1);
  }
}

extract();
