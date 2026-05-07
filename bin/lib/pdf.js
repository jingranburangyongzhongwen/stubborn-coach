// PDF text extraction with lazy dep install.
// Strategy: try pdf-parse first; if the extracted text density is too low
// the caller is told `ocr_needed` and should drive Claude vision Read on the
// PDF page-by-page, saving chunks via `save-extracted` then `merge-extracted`.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PLUGIN_ROOT } = require('./paths');

const MIN_CHARS_PER_PAGE = 50; // below this density we assume image/scan
const PAGES_PER_CHUNK = 10;

function pluginNodeModule(name) {
  return path.join(PLUGIN_ROOT, 'node_modules', name);
}

function ensureDep(name) {
  if (fs.existsSync(pluginNodeModule(name))) return;
  // One-shot install into PLUGIN_ROOT. Quiet, production-only, no audit/fund noise.
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--silent'], {
    cwd: PLUGIN_ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (!fs.existsSync(pluginNodeModule(name))) {
    const error = new Error(`failed to install runtime dependency: ${name}`);
    error.code = 'DEP_INSTALL_FAILED';
    error.details = { hint: 'run `npm install` inside the stubborn-coach plugin folder' };
    throw error;
  }
}

async function extractWithPdfParse(buffer) {
  ensureDep('pdf-parse');
  // pdf-parse reads ./test/data/05-versions-space.pdf at require time when run as script.
  // Requiring `pdf-parse/lib/pdf-parse.js` skips that side effect.
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const pdfParse = require(path.join(pluginNodeModule('pdf-parse'), 'lib', 'pdf-parse.js'));
  const result = await pdfParse(buffer);
  return { text: String(result.text || ''), pages: Number(result.numpages || 0) };
}

function chunkPlan(pages, chunkSize = PAGES_PER_CHUNK) {
  const plan = [];
  for (let start = 1, idx = 1; start <= pages; start += chunkSize, idx += 1) {
    const end = Math.min(start + chunkSize - 1, pages);
    plan.push({ part: idx, pages: `${start}-${end}` });
  }
  return plan;
}

function densityOk(text, pages) {
  if (pages <= 0) return false;
  const meaningful = String(text).replace(/\s+/g, '').length;
  return meaningful / pages >= MIN_CHARS_PER_PAGE;
}

module.exports = {
  PAGES_PER_CHUNK,
  MIN_CHARS_PER_PAGE,
  chunkPlan,
  densityOk,
  extractWithPdfParse,
};
