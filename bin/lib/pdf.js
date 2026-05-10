// Source -> Markdown via docling.
// We rely on a pre-installed `docling` CLI (see README setup). docling handles
// layout, OCR (built-in), tables, formulas, and dual-column reflow on PDF /
// DOCX / PPTX / XLSX / HTML / image / asciidoc — local paths or URLs both
// work. The Node side just spawns the CLI and collects the produced markdown.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// docling on first run downloads layout / ocr / table-former weights (~1GB),
// so the first invocation can be slower than later ones. 30-page papers on a
// modern GPU finish under 2 minutes; CPU users can take 5-10. Cap at 15 minutes
// to surface hung/crashed runs without prematurely killing first-time downloads.
const DOCLING_TIMEOUT_MS = 15 * 60 * 1000;

function findDoclingExecutable() {
  if (process.env.STUBBORN_COACH_DOCLING) return process.env.STUBBORN_COACH_DOCLING;
  return 'docling';
}

// `source` is either an absolute local path or an http(s) URL — docling accepts
// both directly. Output filename for URL sources isn't documented, so we point
// docling at a private temp dir and pick up whatever `.md` it produced.
function runDocling(source) {
  return new Promise((resolve, reject) => {
    const executable = findDoclingExecutable();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docling-'));
    const args = [source, '--to', 'md', '--output', tmpDir];
    let stderr = '';
    let stdout = '';
    let child;
    try {
      child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      cleanup(tmpDir);
      const err = new Error(`docling executable not found (${error.message}). The plugin does NOT auto-install — confirm with the user which Python environment has docling installed, then add that env's Scripts/ (or bin/) to PATH, or set STUBBORN_COACH_DOCLING to the absolute path of the docling executable.`);
      err.code = 'DOCLING_NOT_FOUND';
      err.details = { tried: executable };
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, DOCLING_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      cleanup(tmpDir);
      const err = new Error(`docling executable not found or failed to launch: ${error.message}. The plugin does NOT auto-install — confirm with the user which Python environment has docling, then expose it via PATH or STUBBORN_COACH_DOCLING.`);
      err.code = 'DOCLING_NOT_FOUND';
      err.details = { tried: executable };
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal === 'SIGKILL') {
        cleanup(tmpDir);
        reject(codedDoclingError('DOCLING_TIMEOUT', `docling timed out after ${DOCLING_TIMEOUT_MS / 1000}s`, { stderr_tail: tail(stderr) }));
        return;
      }
      if (code !== 0) {
        cleanup(tmpDir);
        reject(codedDoclingError('DOCLING_FAILED', `docling exited with code ${code}`, { stderr_tail: tail(stderr), stdout_tail: tail(stdout) }));
        return;
      }
      // docling's output filename rule depends on input shape (path vs URL) and
      // version, so we just take whatever .md it produced under our private
      // tmpDir. There can only be one — we passed a single source.
      const candidates = collectMarkdownFiles(tmpDir);
      if (candidates.length === 0) {
        cleanup(tmpDir);
        reject(codedDoclingError('DOCLING_NO_OUTPUT', 'docling produced no markdown output', { tmp_dir: tmpDir, stderr_tail: tail(stderr) }));
        return;
      }
      const text = fs.readFileSync(candidates[0], 'utf8');
      cleanup(tmpDir);
      resolve({ markdown: text });
    });
  });
}

function collectMarkdownFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(full);
    }
  }
  return out;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

function tail(text, max = 600) {
  const str = String(text || '');
  return str.length <= max ? str : str.slice(-max);
}

function codedDoclingError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details || {};
  return error;
}

module.exports = {
  DOCLING_TIMEOUT_MS,
  runDocling,
};
