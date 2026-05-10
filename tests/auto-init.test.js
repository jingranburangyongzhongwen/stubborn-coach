const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { tempWorkspace } = require('./helpers');

const CLI = path.join(__dirname, '..', 'bin', 'stubborn-coach');

function runCli(args, cwd, input = '') {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, input, encoding: 'utf8' });
}

test('write-state auto-inits when study.md and state are missing', () => {
  const root = tempWorkspace('auto-init-write-state');
  assert.equal(fs.existsSync(path.join(root, 'learning-wiki', 'study.md')), false);
  const input = 'type: study-log\ngenerated_at: 2026-05-10\ncurrent_topic: null\ntopics: []\n';
  const result = runCli(['write-state'], root, input);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert(fs.existsSync(path.join(root, 'learning-wiki', 'study.md')));
  assert(fs.existsSync(path.join(root, 'learning-wiki', '.study-state.yml')));
  assert(fs.existsSync(path.join(root, 'source-files')));
});

test('add-topic auto-inits when workspace is empty', () => {
  const root = tempWorkspace('auto-init-add-topic');
  const stdin = 'Auto Init Topic\n\n## 学习地图\n- 1. 第一节点\n\n## 节点讲义\n\n### 1. 第一节点\n正文\n';
  const result = runCli(['add-topic', '--id', 'auto-init'], root, stdin);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const study = fs.readFileSync(path.join(root, 'learning-wiki', 'study.md'), 'utf8');
  assert.match(study, /<!-- topic:auto-init -->/);
  assert(fs.existsSync(path.join(root, 'learning-wiki', '.study-state.yml')));
});

test('add-mistake auto-inits (but still fails because topic does not exist)', () => {
  const root = tempWorkspace('auto-init-add-mistake');
  const result = runCli(['add-mistake', '--topic', 'missing', '--node', '1'], root, '- x\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /TOPIC_NOT_FOUND/);
  assert(fs.existsSync(path.join(root, 'learning-wiki', 'study.md')), 'study.md should have been auto-created');
});

test('auto-init does not overwrite existing study.md content', () => {
  const root = tempWorkspace('auto-init-no-overwrite');
  fs.mkdirSync(path.join(root, 'learning-wiki'), { recursive: true });
  const stateInput = 'type: study-log\ngenerated_at: 2026-05-10\ncurrent_topic: null\ntopics: []\n';
  const r1 = runCli(['write-state'], root, stateInput);
  assert.equal(r1.status, 0);
  const studyBefore = fs.readFileSync(path.join(root, 'learning-wiki', 'study.md'), 'utf8');
  const r2 = runCli(['write-state'], root, stateInput);
  assert.equal(r2.status, 0);
  assert.strictEqual(fs.readFileSync(path.join(root, 'learning-wiki', 'study.md'), 'utf8'), studyBefore);
});
