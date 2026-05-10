// Source extraction CLI handler. One command:
//   extract-source --name <basename>   — converts a binary / online document
//                                        (path or URL on stdin) to markdown
//                                        under <workspace>/source-files/<name>.md
//                                        using the docling CLI.
//
// Inputs accepted (anything docling accepts):
//   - Local absolute path to PDF / DOCX / PPTX / XLSX / HTML / image / asciidoc
//   - http(s):// URL pointing to such a file (e.g. https://arxiv.org/pdf/...)
//
// docling handles layout, OCR (built-in), tables -> markdown tables, formulas
// -> LaTeX, and dual-column reflow, so a single shot replaces the older
// pdf-parse + vision-OCR-fallback split. Path guard whitelists source-files/;
// here we only enforce shape (basename).

const fs = require('fs');
const path = require('path');
const {
  ALLOWED_SOURCE_FILES_DIR,
  codedError,
  ensureWikiDirs,
  isValidBasename,
  resolveWorkspacePath,
} = require('./paths');
const { runDocling } = require('./pdf');

function assertBasename(value) {
  if (!isValidBasename(value)) {
    throw codedError('INVALID_ARGS', '--name must match [A-Za-z0-9._-]+ (no leading dot, no .., no slashes)');
  }
}

function sourceFilesDir(root = process.cwd()) {
  ensureWikiDirs(root);
  return path.join(root, ALLOWED_SOURCE_FILES_DIR);
}

function finalMdPath(root, basename) {
  return resolveWorkspacePath(`${ALLOWED_SOURCE_FILES_DIR}/${basename}.md`, { cwd: root });
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

async function extractSource({ name }, sourceRaw) {
  if (!name) throw codedError('INVALID_ARGS', '--name is required');
  assertBasename(name);
  const source = String(sourceRaw || '').trim();
  if (!source) throw codedError('INVALID_ARGS', 'extract-source requires a path or URL on stdin (single line)');
  if (source.includes('\n')) throw codedError('INVALID_ARGS', 'extract-source stdin must be a single line');

  const root = process.cwd();
  let inputForDocling;
  if (isUrl(source)) {
    inputForDocling = source; // docling accepts URLs directly
  } else {
    const abs = path.isAbsolute(source) ? source : path.resolve(root, source);
    if (!fs.existsSync(abs)) throw codedError('SOURCE_NOT_FOUND', `source not found: ${source}`);
    if (!fs.statSync(abs).isFile()) throw codedError('SOURCE_NOT_FOUND', `source path is not a file: ${source}`);
    inputForDocling = abs;
  }

  sourceFilesDir(root); // ensure source-files/ exists
  const mdPath = finalMdPath(root, name);
  const mdRel = path.relative(root, mdPath);
  if (fs.existsSync(mdPath)) {
    return { ok: true, status: 'already_extracted', name, md: mdRel };
  }

  const { markdown } = await runDocling(inputForDocling);
  if (!markdown || !markdown.trim()) {
    throw codedError('DOCLING_NO_OUTPUT', 'docling returned empty markdown', { name });
  }
  const normalized = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  fs.writeFileSync(mdPath, normalized, 'utf8');
  return {
    ok: true,
    status: 'extracted',
    name,
    md: mdRel,
    chars: normalized.length,
  };
}

module.exports = { extractSource };
