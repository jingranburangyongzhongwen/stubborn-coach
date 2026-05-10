const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { ensureInitialized } = require('../bin/lib/paths');
const { tempWorkspace } = require('./helpers');

const CLI = path.join(__dirname, '..', 'bin', 'stubborn-coach');

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('ensureInitialized creates study.md and .study-state.yml with expected defaults', () => {
  const root = tempWorkspace('init-create');
  const result = ensureInitialized(root);
  assert.deepEqual(result.written, [
    path.join('learning-wiki', 'study.md'),
    path.join('learning-wiki', '.study-state.yml'),
  ]);

  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  const statePath = path.join(root, 'learning-wiki', '.study-state.yml');
  assert(fs.existsSync(studyPath), 'study.md should exist');
  assert(fs.existsSync(statePath), '.study-state.yml should exist');
  const content = fs.readFileSync(studyPath, 'utf8');
  assert.strictEqual(content, '# 学习日志\n\n## 知识库\n');
  const state = fs.readFileSync(statePath, 'utf8');
  assert.match(state, /^type: study-log$/m);
  assert.match(state, /^generated_at: \d{4}-\d{2}-\d{2}$/m);
  assert.match(state, /^current_topic: null$/m);
  assert.match(state, /^topics: \[\]$/m);
});

test('ensureInitialized does not create legacy subdirs', () => {
  const root = tempWorkspace('init-no-legacy');
  ensureInitialized(root);
  for (const legacy of ['sources', 'knowledge', 'sessions', 'reviews']) {
    assert(!fs.existsSync(path.join(root, 'learning-wiki', legacy)), `legacy dir ${legacy} should not exist`);
  }
});

test('ensureInitialized is idempotent and reports updated when both files already exist', () => {
  const root = tempWorkspace('init-idempotent');
  ensureInitialized(root);
  const result = ensureInitialized(root);
  assert.deepEqual(result.written, []);
  assert.deepEqual(result.updated, [
    path.join('learning-wiki', 'study.md'),
    path.join('learning-wiki', '.study-state.yml'),
  ]);
});

test('ensureInitialized refuses legacy frontmatter study.md without creating state', () => {
  const root = tempWorkspace('init-legacy');
  fs.mkdirSync(path.join(root, 'learning-wiki'), { recursive: true });
  fs.writeFileSync(path.join(root, 'learning-wiki', 'study.md'), '---\ntype: study-log\n---\n\n# 学习日志\n', 'utf8');
  assert.throws(() => ensureInitialized(root), /legacy study\.md/);
  assert.equal(fs.existsSync(path.join(root, 'learning-wiki', '.study-state.yml')), false);
});

test('help lists no public commands', () => {
  const root = tempWorkspace('init-help');
  const result = runCli(['--help'], root);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.commands, []);
});

test('init command is no longer public', () => {
  const root = tempWorkspace('init-removed');
  const result = runCli(['init'], root);
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'UNKNOWN_COMMAND');
});
