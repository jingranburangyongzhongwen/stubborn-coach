// PDF extraction CLI handlers. Three commands, one file:
//   extract-pdf       --file <path>                — try text-layer; report ocr_needed when scan
//   save-extracted    --name <basename> --part <N> — append a vision-OCR chunk
//   merge-extracted   --name <basename>            — concatenate parts into final .txt
//
// All three write strictly into <workspace>/source-files/. The path guard already
// whitelists that directory; here we only enforce shape (basename / part number).

const fs = require('fs');
const path = require('path');
const {
  ALLOWED_SOURCE_FILES_DIR,
  codedError,
  ensureWikiDirs,
  isValidBasename,
  isValidPart3,
  resolveWorkspacePath,
} = require('./paths');
const { extractWithPdfParse, densityOk, chunkPlan } = require('./pdf');

// Shape predicates live in `paths.js` so the Bash path guard and this CLI
// handler share one source of truth. Don't reintroduce local regexes here.
function assertBasename(value) {
  if (!isValidBasename(value)) {
    throw codedError('INVALID_ARGS', '--name must match [A-Za-z0-9._-]+ (no leading dot, no .., no slashes)');
  }
}

function assertPart(value) {
  if (!isValidPart3(value)) {
    throw codedError('INVALID_ARGS', '--part must be a 1-3 digit integer');
  }
}

function sourceFilesDir(root = process.cwd()) {
  ensureWikiDirs(root);
  return path.join(root, ALLOWED_SOURCE_FILES_DIR);
}

function finalTxtPath(root, basename) {
  return resolveWorkspacePath(`${ALLOWED_SOURCE_FILES_DIR}/${basename}.txt`, { cwd: root });
}

function partTxtPath(root, basename, partNum) {
  const padded = String(partNum).padStart(3, '0');
  return resolveWorkspacePath(`${ALLOWED_SOURCE_FILES_DIR}/.${basename}.part-${padded}.txt`, { cwd: root });
}

function listExistingParts(root, basename) {
  const dir = sourceFilesDir(root);
  const prefix = `.${basename}.part-`;
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.txt'))
    .map((name) => Number(name.slice(prefix.length, name.length - 4)))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
}

async function extractPdf({ name }, pdfPathRaw) {
  if (!name) throw codedError('INVALID_ARGS', '--name is required');
  assertBasename(name);
  const pdfPath = String(pdfPathRaw || '').trim();
  if (!pdfPath) throw codedError('INVALID_ARGS', 'extract-pdf requires the PDF path on stdin (single line)');
  if (pdfPath.includes('\n')) throw codedError('INVALID_ARGS', 'extract-pdf stdin must be a single-line path');
  const root = process.cwd();
  const absPdf = path.isAbsolute(pdfPath) ? pdfPath : path.resolve(root, pdfPath);
  if (!fs.existsSync(absPdf)) throw codedError('PDF_NOT_FOUND', `pdf not found: ${pdfPath}`);
  if (!fs.statSync(absPdf).isFile()) throw codedError('PDF_NOT_FOUND', `pdf path is not a file: ${pdfPath}`);

  const txtPath = finalTxtPath(root, name);
  const txtRel = path.relative(root, txtPath);
  if (fs.existsSync(txtPath)) {
    return { ok: true, status: 'already_extracted', name, txt: txtRel };
  }

  const buffer = fs.readFileSync(absPdf);
  const { text, pages } = await extractWithPdfParse(buffer);

  if (densityOk(text, pages)) {
    fs.writeFileSync(txtPath, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    return { ok: true, status: 'extracted', name, pages, chars: text.length, txt: txtRel };
  }

  // Scan / image PDF — main flow must drive Claude vision Read per chunk.
  const existing = listExistingParts(root, name);
  const plan = chunkPlan(pages);
  const remaining = plan.filter((p) => !existing.includes(p.part));
  return {
    ok: true,
    status: 'ocr_needed',
    name,
    pages,
    pdf_abs: absPdf,
    chunk_plan: plan,
    completed_parts: existing,
    remaining_parts: remaining,
    next_step: 'For each remaining_part, use Read on the absolute pdf_abs path with the `pages` arg, transcribe to markdown, then `stubborn-coach save-extracted --name <name> --part <N>` with text on stdin. After all parts exist, `stubborn-coach merge-extracted --name <name>`.',
  };
}

function saveExtracted({ name, part }, content) {
  assertBasename(name);
  assertPart(part);
  const text = String(content || '');
  if (!text.trim()) throw codedError('EMPTY_STDIN', 'save-extracted requires transcribed text on stdin');
  const root = process.cwd();
  sourceFilesDir(root); // ensure source-files/ exists
  const target = partTxtPath(root, name, Number(part));
  if (fs.existsSync(target)) {
    return { ok: true, status: 'part_exists', written: [path.relative(root, target)], bytes: fs.statSync(target).size };
  }
  const normalized = text.endsWith('\n') ? text : `${text}\n`;
  fs.writeFileSync(target, normalized, 'utf8');
  return {
    ok: true,
    status: 'part_saved',
    written: [path.relative(root, target)],
    bytes: Buffer.byteLength(normalized, 'utf8'),
  };
}

function mergeExtracted({ name }) {
  assertBasename(name);
  const root = process.cwd();
  const parts = listExistingParts(root, name);
  if (!parts.length) throw codedError('NO_PARTS', `no extracted parts found for ${name}`);
  // Sanity-check: parts must be a contiguous prefix 1..N (no gaps).
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] !== i + 1) {
      throw codedError('PARTS_INCOMPLETE', `part ${i + 1} missing for ${name}`, { existing: parts });
    }
  }
  const target = finalTxtPath(root, name);
  const chunks = parts.map((p) => fs.readFileSync(partTxtPath(root, name, p), 'utf8').replace(/\s+$/, ''));
  const merged = `${chunks.join('\n\n')}\n`;
  fs.writeFileSync(target, merged, 'utf8');
  for (const p of parts) fs.unlinkSync(partTxtPath(root, name, p));
  return {
    ok: true,
    status: 'merged',
    written: [path.relative(root, target)],
    parts: parts.length,
    bytes: Buffer.byteLength(merged, 'utf8'),
  };
}

module.exports = { extractPdf, saveExtracted, mergeExtracted };
