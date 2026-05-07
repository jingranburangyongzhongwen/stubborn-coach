const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { tempWorkspace } = require('./helpers');

const CLI = path.join(__dirname, '..', 'bin', 'stubborn-coach');

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('init creates study.md and .study-state.yml with expected defaults', () => {
  const root = tempWorkspace('init-create');
  const result = runCli(['init'], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.written, [
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

test('init does not create legacy subdirs', () => {
  const root = tempWorkspace('init-no-legacy');
  const result = runCli(['init'], root);
  assert.equal(result.status, 0);
  for (const legacy of ['sources', 'knowledge', 'sessions', 'reviews']) {
    assert(!fs.existsSync(path.join(root, 'learning-wiki', legacy)), `legacy dir ${legacy} should not exist`);
  }
});

test('init is idempotent and reports updated when both files already exist', () => {
  const root = tempWorkspace('init-idempotent');
  const first = runCli(['init'], root);
  assert.equal(first.status, 0);
  const second = runCli(['init'], root);
  assert.equal(second.status, 0);
  const payload = JSON.parse(second.stdout);
  assert.deepEqual(payload.written, []);
  assert.deepEqual(payload.updated, [
    path.join('learning-wiki', 'study.md'),
    path.join('learning-wiki', '.study-state.yml'),
  ]);
});

test('init refuses legacy frontmatter study.md without creating state', () => {
  const root = tempWorkspace('init-legacy');
  fs.mkdirSync(path.join(root, 'learning-wiki'), { recursive: true });
  fs.writeFileSync(path.join(root, 'learning-wiki', 'study.md'), '---\ntype: study-log\n---\n\n# 学习日志\n', 'utf8');
  const result = runCli(['init'], root);
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'LEGACY_STUDY_MD');
  assert.equal(fs.existsSync(path.join(root, 'learning-wiki', '.study-state.yml')), false);
});

test('removed subcommands now report unknown_command and exit non-zero', () => {
  const root = tempWorkspace('init-unknown');
  for (const removed of ['write-source', 'write-mastery-result', 'write-knowledge-status', 'validate']) {
    const result = runCli([removed], root);
    assert.notEqual(result.status, 0, `${removed} should fail`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, 'UNKNOWN_COMMAND');
  }
});

test('help lists only init', () => {
  const root = tempWorkspace('init-help');
  const result = runCli(['--help'], root);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.commands, ['init']);
});
