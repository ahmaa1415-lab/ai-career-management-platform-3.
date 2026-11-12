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
    const { PDFParse } = require('pdf-parse');
    const workerPath = path.resolve(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs');
    if (fs.existsSync(workerPath)) {
      PDFParse.setWorker(pathToFileURL(workerPath).href);
    }
    const parser = new PDFParse({ data: buf });
    const res = await parser.getText();
    await parser.destroy();
    if (res && res.text) {
      process.stdout.write(res.text);
      process.exit(0);
    }
  } catch (err) {
    console.error('PDFParse error:', err.message);
  }

  // Fallback to pdfjs-dist directly if PDFParse had an issue
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
    console.error('pdfjsLib fallback error:', err2.message);
    process.exit(1);
  }
}

extract();
