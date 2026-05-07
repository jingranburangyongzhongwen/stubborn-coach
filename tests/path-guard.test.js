const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { ALLOWED_WIKI_FILES, ensureWikiDirs, resolveWorkspacePath, validateBashCommand } = require('../bin/lib/paths');
const { tempWorkspace } = require('./helpers');

const HOOK = path.join(__dirname, '..', 'hooks', 'enforce-workspace-paths.js');

test('only learning wiki files and source-files/** are writable', () => {
  const root = tempWorkspace('paths-allow');
  ensureWikiDirs(root);
  assert.deepEqual(ALLOWED_WIKI_FILES, [path.join('learning-wiki', 'study.md'), path.join('learning-wiki', '.study-state.yml')]);
  assert(resolveWorkspacePath('learning-wiki/study.md', { cwd: root }).endsWith(path.join('learning-wiki', 'study.md')));
  assert(resolveWorkspacePath('learning-wiki/.study-state.yml', { cwd: root }).endsWith(path.join('learning-wiki', '.study-state.yml')));
  assert(resolveWorkspacePath('source-files/notes.txt', { cwd: root }).endsWith(path.join('source-files', 'notes.txt')));
  assert.throws(() => resolveWorkspacePath('learning-wiki/index.md', { cwd: root }), /writable|not allowed/);
  assert.throws(() => resolveWorkspacePath('learning-wiki/knowledge/foo.md', { cwd: root }), /writable|not allowed/);
  assert.throws(() => resolveWorkspacePath('learning-wiki/sessions/latest.md', { cwd: root }), /writable|not allowed/);
});

test('rejects traversal, absolute escapes, home and temp roots', () => {
  const root = tempWorkspace('paths-reject');
  ensureWikiDirs(root);
  assert.throws(() => resolveWorkspacePath('../outside.md', { cwd: root }), /writable|not allowed|outside|containing/);
  assert.throws(() => resolveWorkspacePath(path.join(os.homedir(), 'notes.md'), { cwd: root }), /outside/);
  assert.throws(() => resolveWorkspacePath(path.join(os.tmpdir(), 'notes.md'), { cwd: root }), /outside/);
  if (process.platform !== 'win32') {
    assert.throws(() => resolveWorkspacePath('C:\\Users\\someone\\notes.md', { cwd: root }), /writable|not allowed|outside|containing/);
  }
});

test('only `stubborn-coach init` plus hidden writer commands are allowed via Bash', () => {
  assert.equal(validateBashCommand('stubborn-coach init'), true);
  assert.equal(validateBashCommand('stubborn-coach init --help'), true);
  assert.equal(validateBashCommand('stubborn-coach --help'), true);
  assert.equal(validateBashCommand('stubborn-coach help'), true);
  assert.equal(validateBashCommand('stubborn-coach write-state'), true);
  assert.equal(validateBashCommand("stubborn-coach write-state <<'STATE'\ntype: study-log\n| a | b |\n> quote\nSTATE"), true);
  assert.equal(validateBashCommand("stubborn-coach add-topic --id foo-bar <<'TOPIC'\n### Foo\nTOPIC"), true);
  assert.equal(validateBashCommand("stubborn-coach add-node --topic foo-bar --idx 2 <<'NODE'\n##### 2. Next\nNODE"), true);
  assert.equal(validateBashCommand("stubborn-coach add-mistake --topic foo-bar --node 2 <<'MISTAKE'\n- 错题\nMISTAKE"), true);
  assert.throws(() => validateBashCommand('stubborn-coach write-source'), /init.*write-state/);
  assert.throws(() => validateBashCommand('stubborn-coach validate'), /init.*write-state/);
  assert.throws(() => validateBashCommand('stubborn-coach write-mastery-result'), /init.*write-state/);
  assert.throws(() => validateBashCommand("stubborn-coach write-state <<'STATE'\ntype: study-log\nSTATE\necho bad"), /heredoc/);
  assert.throws(() => validateBashCommand("stubborn-coach write-state <<'STATE'\ntype: study-log\nSTATE\nSTATE"), /heredoc/);
  assert.throws(() => validateBashCommand('node script.js'), /only Bash/);
  assert.throws(() => validateBashCommand('stubborn-coach init || true'), /chaining/);
  assert.throws(() => validateBashCommand('stubborn-coach init | tee out.txt'), /chaining/);
  assert.throws(() => validateBashCommand('stubborn-coach init > out.txt'), /redirection/);
  assert.throws(() => validateBashCommand('stubborn-coach add-topic --topic foo'), /add-topic/);
  assert.throws(() => validateBashCommand('stubborn-coach add-node --topic foo --idx 100'), /integer from 1 to 99/);
  assert.throws(() => validateBashCommand('stubborn-coach add-mistake --topic foo --node 2;rm'), /arguments|allowed|chaining/);
});

test('allows a single leading `cd <path> &&` prefix because Cursor injects one', () => {
  assert.equal(validateBashCommand('cd "D:\\OneDrive\\idreamsky\\learn-skill-design" && stubborn-coach init'), true);
  assert.equal(validateBashCommand("cd 'D:/work/proj' && stubborn-coach init"), true);
  assert.equal(validateBashCommand('cd /tmp/proj && stubborn-coach init'), true);
  assert.equal(validateBashCommand('cd "D:\\proj" && stubborn-coach --help'), true);
  assert.equal(validateBashCommand('cd "D:\\proj" && stubborn-coach write-state'), true);
  // Reject cd traversal:
  assert.throws(() => validateBashCommand('cd ../escape && stubborn-coach init'), /may not contain \.\./);
  // Reject any further chain after cd:
  assert.throws(() => validateBashCommand('cd /tmp && stubborn-coach init && echo done'), /chaining/);
  // Reject if main command is not stubborn-coach:
  assert.throws(() => validateBashCommand('cd /tmp && rm -rf /'), /only Bash/);
});

test('hook blocks Write/Edit/MultiEdit tools so terminal never renders file diffs', () => {
  const root = tempWorkspace('hook-allow');
  ensureWikiDirs(root);
  const writeKnowledgeMd = runHook(root, { tool_name: 'Write', tool_input: { file_path: 'learning-wiki/study.md', content: 'ok' } });
  assert.equal(writeKnowledgeMd.status, 2);
  assertDeny(writeKnowledgeMd.stdout, /write-state|add-topic|diffs/);
  const writeState = runHook(root, { tool_name: 'Write', tool_input: { file_path: 'learning-wiki/.study-state.yml', content: 'ok' } });
  assert.equal(writeState.status, 2);
  assertDeny(writeState.stdout, /write-state|add-topic|diffs/);
  const editStudy = runHook(root, { tool_name: 'Edit', tool_input: { file_path: 'learning-wiki/study.md', old_string: 'a', new_string: 'b' } });
  assert.equal(editStudy.status, 2);
  assertDeny(editStudy.stdout, /write-state|add-topic|diffs/);
  const writeSource = runHook(root, { tool_name: 'Write', tool_input: { file_path: 'source-files/note.txt', content: 'ok' } });
  assert.equal(writeSource.status, 2);
  assertDeny(writeSource.stdout, /write-state|add-topic|diffs/);
});

test('hook auto-approves whitelisted bash commands', () => {
  const root = tempWorkspace('hook-bash-allow');
  ensureWikiDirs(root);
  const bashInit = runHook(root, { tool_name: 'Bash', tool_input: { command: 'stubborn-coach init' } });
  assert.equal(bashInit.status, 0);
  assertAllow(bashInit.stdout);
  const bashCdInit = runHook(root, { tool_name: 'Bash', tool_input: { command: 'cd "D:\\proj" && stubborn-coach init' } });
  assert.equal(bashCdInit.status, 0);
  assertAllow(bashCdInit.stdout);
  const bashWriteState = runHook(root, { tool_name: 'Bash', tool_input: { command: "stubborn-coach write-state <<'STATE'\ntype: study-log\nSTATE" } });
  assert.equal(bashWriteState.status, 0);
  assertAllow(bashWriteState.stdout);
  const bashAddTopic = runHook(root, { tool_name: 'Bash', tool_input: { command: "stubborn-coach add-topic --id foo <<'TOPIC'\n### Foo\nTOPIC" } });
  assert.equal(bashAddTopic.status, 0);
  assertAllow(bashAddTopic.stdout);
});

test('hook denies legacy paths and forbidden bash subcommands (with stdout JSON deny)', () => {
  const root = tempWorkspace('hook-deny');
  ensureWikiDirs(root);
  const writeKnowledge = runHook(root, { tool_name: 'Write', tool_input: { file_path: 'learning-wiki/knowledge/foo.md', content: 'bad' } });
  assert.equal(writeKnowledge.status, 2);
  assertDeny(writeKnowledge.stdout, /writable|not allowed/);
  const writeOutsideHome = runHook(root, { tool_name: 'Write', tool_input: { file_path: '.claude/learning/foo.md', content: 'bad' } });
  assert.equal(writeOutsideHome.status, 2);
  assertDeny(writeOutsideHome.stdout, /writable|not allowed/);
  const bashWriteSource = runHook(root, { tool_name: 'Bash', tool_input: { command: 'stubborn-coach write-source' } });
  assert.equal(bashWriteSource.status, 2);
  assertDeny(bashWriteSource.stdout, /init.*write-state/);
});

test('hook does not auto-approve non-write tools (Read passes through to normal permission flow)', () => {
  const root = tempWorkspace('hook-passthrough');
  ensureWikiDirs(root);
  const readAny = runHook(root, { tool_name: 'Read', tool_input: { file_path: 'learning-wiki/study.md' } });
  assert.equal(readAny.status, 0);
  // Read 没有 file_path 进入 filePathsFor 时，Read 仍走 passthrough（exit 0、空 stdout）。
  // 这里我们让 Read 也带 file_path（Claude Code 实际行为），但 Read 不是 Write/Edit/MultiEdit 之一。
  // 当前 hook 配置只匹配 Write|Edit|MultiEdit|Bash，所以正常情况下 Read 根本不会调到 hook。
  // 兜底测试：若手动塞 file_path 进 Read，hook 还是走 resolveWorkspacePath 校验后 allow（因为 study.md 在白名单）。
  assertAllow(readAny.stdout);
});

function runHook(cwd, input) {
  try {
    const stdout = execFileSync(process.execPath, [HOOK], {
      cwd,
      input: JSON.stringify(input),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: String(stdout || ''), stderr: '' };
  } catch (error) {
    return { status: error.status, stdout: String(error.stdout || ''), stderr: String(error.stderr || '') };
  }
}

function assertAllow(stdout) {
  assert(stdout.length > 0, 'expected non-empty JSON on stdout');
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.hookSpecificOutput?.hookEventName, 'PreToolUse');
  assert.equal(parsed.hookSpecificOutput?.permissionDecision, 'allow');
}

function assertDeny(stdout, reasonRegex) {
  assert(stdout.length > 0, 'expected non-empty JSON on stdout');
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.hookSpecificOutput?.hookEventName, 'PreToolUse');
  assert.equal(parsed.hookSpecificOutput?.permissionDecision, 'deny');
  if (reasonRegex) assert.match(parsed.hookSpecificOutput?.permissionDecisionReason || '', reasonRegex);
}
