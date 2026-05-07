const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
// Only the learning wiki files plus an optional user upload area are writable.
const ALLOWED_WIKI_FILES = [
  path.join('learning-wiki', 'study.md'),
  path.join('learning-wiki', '.study-state.yml'),
];
const ALLOWED_WIKI_FILE = ALLOWED_WIKI_FILES[0];
const ALLOWED_SOURCE_FILES_DIR = 'source-files';

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function canonicalPath(value) {
  let normalized = path.resolve(String(value || '')).replace(/^\\\\\?\\/, '');
  if (process.platform === 'win32') normalized = normalized.toLowerCase();
  return normalized;
}

function isSubpath(child, parent) {
  const relative = path.relative(canonicalPath(parent), canonicalPath(child));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function existingParent(targetPath) {
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const next = path.dirname(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function realpathIfExists(targetPath) {
  const resolved = fs.existsSync(targetPath)
    ? fs.realpathSync.native(targetPath)
    : fs.realpathSync.native(existingParent(targetPath));
  return canonicalPath(resolved);
}

function workspaceRoot(cwd = process.cwd()) {
  return canonicalPath(fs.realpathSync.native(path.resolve(cwd)));
}

function forbiddenRoots() {
  const roots = [os.homedir(), os.tmpdir(), PLUGIN_ROOT];
  return roots.filter(Boolean).map((root) => {
    try {
      return canonicalPath(fs.realpathSync.native(root));
    } catch (_) {
      return canonicalPath(root);
    }
  });
}

function containsTraversal(rawPath) {
  return normalizePath(rawPath).split('/').includes('..');
}

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function resolveWorkspacePath(rawPath, options = {}) {
  const cwd = options.cwd || process.cwd();
  const root = workspaceRoot(cwd);
  const raw = String(rawPath || '');
  if (!raw) throw codedError('PATH_MISSING', 'file path is required');
  if (containsTraversal(raw)) throw codedError('PATH_TRAVERSAL', 'paths containing .. are not allowed', { path: raw });

  const resolved = canonicalPath(path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw));
  if (!isSubpath(resolved, root)) {
    throw codedError('PATH_OUTSIDE_WORKSPACE', 'path resolves outside the current workspace', { path: raw, resolved, root });
  }

  const allowSourceFiles = options.allowSourceFiles !== false;
  const wikiFileAbsList = ALLOWED_WIKI_FILES.map((filePath) => canonicalPath(path.join(root, filePath)));
  const sourceFilesAbs = canonicalPath(path.join(root, ALLOWED_SOURCE_FILES_DIR));

  const isWikiFile = wikiFileAbsList.includes(resolved);
  const isUnderSourceFiles = allowSourceFiles && isSubpath(resolved, sourceFilesAbs);

  if (!isWikiFile && !isUnderSourceFiles) {
    throw codedError('PATH_NOT_ALLOWED', 'only learning-wiki/study.md, learning-wiki/.study-state.yml (and source-files/) are writable', {
      path: raw,
      allowed: [...ALLOWED_WIKI_FILES, allowSourceFiles ? `${ALLOWED_SOURCE_FILES_DIR}/**` : null].filter(Boolean),
    });
  }

  const parentReal = realpathIfExists(path.dirname(resolved));
  if (!isSubpath(parentReal, root)) {
    throw codedError('SYMLINK_ESCAPE', 'path parent resolves outside the workspace', { path: raw, parentReal, root });
  }

  for (const forbidden of forbiddenRoots()) {
    if (
      isSubpath(resolved, forbidden) &&
      !isSubpath(resolved, path.join(root, 'learning-wiki')) &&
      !isSubpath(resolved, path.join(root, ALLOWED_SOURCE_FILES_DIR))
    ) {
      throw codedError('FORBIDDEN_ROOT', 'path points into a forbidden root', { path: raw, forbidden });
    }
  }

  return resolved;
}

function ensureWithinWorkspaceForRead(rawPath, options = {}) {
  const cwd = options.cwd || process.cwd();
  const root = workspaceRoot(cwd);
  const raw = String(rawPath || '');
  const resolved = canonicalPath(path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw));
  if (!isSubpath(resolved, root)) {
    throw codedError('PATH_OUTSIDE_WORKSPACE', 'read path resolves outside the current workspace', { path: rawPath });
  }
  return resolved;
}

// Strip an optional `cd <path> &&` prefix that Cursor / Claude Code prepend before running tools.
// The path may be quoted (single or double) or unquoted; `..` traversal is rejected.
function stripCdPrefix(value) {
  const cdMatch = value.match(/^cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*&&\s*([\s\S]+)$/i);
  if (!cdMatch) return { rest: value, cdPath: null };
  const cdPath = cdMatch[1] ?? cdMatch[2] ?? cdMatch[3];
  if (!cdPath) {
    throw codedError('BASH_CD_INVALID', '`cd` prefix requires a path');
  }
  if (cdPath.replace(/\\/g, '/').split('/').includes('..')) {
    throw codedError('BASH_CD_TRAVERSAL', '`cd` prefix may not contain ..', { path: cdPath });
  }
  return { rest: cdMatch[4].trim(), cdPath };
}

const HIDDEN_HEREDOC_COMMANDS = new Set(['write-state', 'add-topic', 'add-node', 'add-mistake', 'save-extracted', 'extract-pdf']);
const HIDDEN_NO_STDIN_COMMANDS = new Set(['merge-extracted']);
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASENAME_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

function parseFlagPairs(argsPart, originalCommand) {
  const args = String(argsPart || '').trim();
  if (!args) return {};
  if (/[;&|<>`$(){}[\]*?~!\\'"]/.test(args)) {
    throw codedError('BASH_ARGS_INVALID', 'hidden stubborn-coach command arguments may only contain flags, kebab ids, integers, and source-files paths', { command: originalCommand });
  }
  const tokens = args.split(/\s+/);
  if (tokens.length % 2 !== 0) {
    throw codedError('BASH_ARGS_INVALID', 'hidden stubborn-coach command arguments must be flag/value pairs', { command: originalCommand });
  }
  const parsed = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];
    if (!/^--[a-z-]+$/.test(key) || !value || parsed[key] !== undefined) {
      throw codedError('BASH_ARGS_INVALID', 'hidden stubborn-coach command arguments must be unique flag/value pairs', { command: originalCommand });
    }
    parsed[key] = value;
  }
  return parsed;
}

function assertKebab(value, flag, originalCommand) {
  if (!KEBAB_RE.test(value || '')) {
    throw codedError('BASH_ARGS_INVALID', `${flag} must be kebab-case`, { command: originalCommand });
  }
}

function assertSmallInt(value, flag, originalCommand) {
  if (!/^(?:[1-9]|[1-9][0-9])$/.test(value || '')) {
    throw codedError('BASH_ARGS_INVALID', `${flag} must be an integer from 1 to 99`, { command: originalCommand });
  }
}

// Single source of truth for the basename / part-number shape used by both
// the Bash path guard (this file) and the CLI handler (`bin/lib/pdf-cli.js`).
// Keep these as pure predicates so callers can wrap them in whichever error
// code their layer prefers (BASH_ARGS_INVALID for the guard, INVALID_ARGS for
// the CLI). Do NOT duplicate these regexes elsewhere.
function isValidBasename(value) {
  const str = String(value || '');
  return BASENAME_RE.test(str) && !str.includes('..');
}

function isValidPart3(value) {
  return /^[0-9]{1,3}$/.test(String(value || ''));
}

function assertBasename(value, flag, originalCommand) {
  if (!isValidBasename(value)) {
    throw codedError('BASH_ARGS_INVALID', `${flag} must match [A-Za-z0-9._-]+ (no .., no slashes)`, { command: originalCommand });
  }
}

function assertPart3(value, flag, originalCommand) {
  if (!isValidPart3(value)) {
    throw codedError('BASH_ARGS_INVALID', `${flag} must be a 1-3 digit integer`, { command: originalCommand });
  }
}

const COMMAND_SPECS = {
  'write-state':     { keys: '',                    usage: '`write-state` does not accept arguments',                              validators: {} },
  'add-topic':       { keys: '--id',                usage: '`add-topic` only accepts `--id <kebab>`',                              validators: { '--id':    assertKebab } },
  'add-node':        { keys: '--idx,--topic',       usage: '`add-node` only accepts `--topic <kebab> --idx <1-99>`',               validators: { '--topic': assertKebab, '--idx':  assertSmallInt } },
  'add-mistake':     { keys: '--node,--topic',      usage: '`add-mistake` only accepts `--topic <kebab> --node <1-99>`',           validators: { '--topic': assertKebab, '--node': assertSmallInt } },
  'save-extracted':  { keys: '--name,--part',       usage: '`save-extracted` only accepts `--name <basename> --part <1-999>`',     validators: { '--name':  assertBasename, '--part': assertPart3 } },
  'extract-pdf':     { keys: '--name',              usage: '`extract-pdf` only accepts `--name <basename>` (PDF path on stdin)',   validators: { '--name':  assertBasename } },
  'merge-extracted': { keys: '--name',              usage: '`merge-extracted` only accepts `--name <basename>`',                   validators: { '--name':  assertBasename } },
};

function validateAddCommandArgs(name, argsPart, originalCommand) {
  const args = parseFlagPairs(argsPart, originalCommand);
  const keys = Object.keys(args).sort().join(',');
  const spec = COMMAND_SPECS[name];
  if (!spec) return false;
  if (keys !== spec.keys) {
    throw codedError('BASH_ARGS_INVALID', spec.usage, { command: originalCommand });
  }
  for (const [flag, validator] of Object.entries(spec.validators)) {
    validator(args[flag], flag, originalCommand);
  }
  return true;
}

function validateHeredocSubcommand(rest, originalCommand) {
  const heredoc = rest.match(/^stubborn-coach\s+([a-z-]+)([^\n]*?)(?:\s+<<\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\3\s*\r?\n([\s\S]*))?$/);
  if (!heredoc) return false;
  const name = heredoc[1];
  if (!HIDDEN_HEREDOC_COMMANDS.has(name)) return false;

  validateAddCommandArgs(name, heredoc[2], originalCommand);
  const delimiter = heredoc[4];
  const body = heredoc[5];
  if (delimiter === undefined) return true;

  const lines = body.split(/\r?\n/);
  let lastNonEmpty = -1;
  let delimiterCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim()) lastNonEmpty = index;
    if (lines[index] === delimiter) delimiterCount += 1;
  }
  if (lastNonEmpty < 0 || lines[lastNonEmpty] !== delimiter || delimiterCount !== 1) {
    throw codedError('BASH_HEREDOC_INVALID', '`stubborn-coach` heredoc must end with its delimiter exactly once', { command: originalCommand });
  }
  return true;
}

function validateNoStdinSubcommand(rest, originalCommand) {
  const match = rest.match(/^stubborn-coach\s+([a-z-]+)\s*([^\n]*)$/);
  if (!match) return false;
  const name = match[1];
  if (!HIDDEN_NO_STDIN_COMMANDS.has(name)) return false;
  validateAddCommandArgs(name, match[2], originalCommand);
  return true;
}

function validateBashCommand(command) {
  const value = String(command || '').trim();
  // Allow at most one leading `cd <path> &&` prefix; everything after must be a `stubborn-coach` command.
  const { rest } = stripCdPrefix(value);

  if (!/^stubborn-coach(\s|$)/.test(rest)) {
    throw codedError('BASH_NOT_ALLOWED', 'only Bash commands beginning with stubborn-coach (optionally prefixed by `cd <path> &&`) are allowed');
  }
  if (validateHeredocSubcommand(rest, value)) {
    return true;
  }
  // Reject any further chaining / redirection in the remainder.
  if (/&&|\|\||;|(^|[^<])\|/.test(rest)) {
    throw codedError('BASH_CHAIN_NOT_ALLOWED', 'Bash command chaining beyond a single leading `cd && ` prefix is not allowed');
  }
  if (/(^|[\s;&|])(?:>|>>|tee|cp|mv|rm|del|copy|powershell|pwsh|node\s+-e)\b/i.test(rest) || /(^|[^<])>{1,2}/.test(rest)) {
    throw codedError('BASH_REDIRECT_NOT_ALLOWED', 'Bash redirection and general shell file operations are not allowed');
  }
  if (validateNoStdinSubcommand(rest, value)) {
    return true;
  }
  // After stubborn-coach, only public `init` (with optional --help / -h) or whitelisted hidden commands are allowed.
  const afterCmd = rest.replace(/^stubborn-coach\s*/, '').trim();
  if (afterCmd === '' || afterCmd === '-h' || afterCmd === '--help' || afterCmd === 'help') {
    return true;
  }
  if (!/^init\b/.test(afterCmd)) {
    throw codedError('BASH_SUBCOMMAND_NOT_ALLOWED', 'only `stubborn-coach init` and hidden writer commands (write-state / add-topic / add-node / add-mistake / extract-pdf / save-extracted / merge-extracted) are allowed', { command: value });
  }
  const initArgs = afterCmd.replace(/^init\s*/, '').trim();
  if (initArgs && !/^(-h|--help)$/.test(initArgs)) {
    throw codedError('BASH_SUBCOMMAND_NOT_ALLOWED', '`stubborn-coach init` does not accept extra arguments', { command: value });
  }
  return true;
}

function ensureWikiDirs(cwd = process.cwd()) {
  const root = path.resolve(cwd);
  // Only the two top-level directories are created. No more sources/knowledge/sessions/reviews subdirs.
  for (const dir of ['learning-wiki', ALLOWED_SOURCE_FILES_DIR]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
}

module.exports = {
  PLUGIN_ROOT,
  ALLOWED_WIKI_FILE,
  ALLOWED_WIKI_FILES,
  ALLOWED_SOURCE_FILES_DIR,
  codedError,
  canonicalPath,
  ensureWikiDirs,
  ensureWithinWorkspaceForRead,
  isSubpath,
  isValidBasename,
  isValidPart3,
  resolveWorkspacePath,
  validateAddCommandArgs,
  validateBashCommand,
  validateHeredocSubcommand,
  workspaceRoot,
};
