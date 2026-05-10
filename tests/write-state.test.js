const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { ensureInitialized } = require('../bin/lib/paths');
const { tempWorkspace } = require('./helpers');

const CLI = path.join(__dirname, '..', 'bin', 'stubborn-coach');

function runCli(args, cwd, input = '') {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, input, encoding: 'utf8' });
}

function initialize(root) {
  ensureInitialized(root);
}

function stateWithTopics(ids) {
  const topics = ids.length
    ? ids.map((id) => `  - id: ${id}\n    title: ${id}`).join('\n')
    : '[]';
  return `type: study-log\ngenerated_at: 2026-04-30\ncurrent_topic: null\ntopics: ${ids.length ? `\n${topics}` : topics}\n`;
}

test('write-state writes valid YAML and does not touch study.md', () => {
  const root = tempWorkspace('write-state-valid');
  initialize(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  const beforeStudy = fs.readFileSync(studyPath, 'utf8');
  const input = stateWithTopics(['alpha']);
  const result = runCli(['write-state'], root, input);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, 'write-state');
  assert.deepEqual(payload.written, [path.join('learning-wiki', '.study-state.yml')]);
  assert.strictEqual(fs.readFileSync(path.join(root, 'learning-wiki', '.study-state.yml'), 'utf8'), input);
  assert.strictEqual(fs.readFileSync(studyPath, 'utf8'), beforeStudy);
});

test('write-state rejects empty, markdown, wrong type, and missing topics', () => {
  const root = tempWorkspace('write-state-invalid');
  initialize(root);
  for (const input of ['', '# 学习日志\n', 'type: other\ngenerated_at: 2026-04-30\ntopics: []\n', 'type: study-log\ncurrent_topic: null\n']) {
    const result = runCli(['write-state'], root, input);
    assert.notEqual(result.status, 0, `input should fail: ${input}`);
  }
});

test('write-state normalizes omitted constant type field', () => {
  const root = tempWorkspace('write-state-missing-type');
  initialize(root);
  const input = 'generated_at: "2026-04-30"\ncurrent_topic: null\ntopics: []\n';
  const result = runCli(['write-state'], root, input);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'learning-wiki', '.study-state.yml'), 'utf8'),
    `type: study-log\n${input}`,
  );
});

test('write-state allows first non-empty topics write after init template', () => {
  const root = tempWorkspace('write-state-first-topic');
  initialize(root);
  assert.equal(runCli(['write-state'], root, stateWithTopics(['first-topic'])).status, 0);
});

function stateWithMap(id, currentIdx, doneFlags) {
  const nodes = doneFlags
    .map((done, i) => `      - idx: ${i + 1}\n        label: n${i + 1}\n        done: ${done}`)
    .join('\n');
  return `type: study-log\ngenerated_at: 2026-04-30\ncurrent_topic: ${id}\ntopics:\n  - id: ${id}\n    title: ${id}\n    current_node_idx: ${currentIdx}\n    map:\n${nodes}\n`;
}

test('write-state accepts consistent done-prefix with matching current_node_idx', () => {
  const root = tempWorkspace('write-state-invariant-ok');
  initialize(root);
  const cases = [
    stateWithMap('a', 1, [false, false, false]),
    stateWithMap('a', 2, [true, false, false]),
    stateWithMap('a', 3, [true, true, false]),
    stateWithMap('a', 4, [true, true, true]),
  ];
  for (const input of cases) {
    const result = runCli(['write-state'], root, input);
    assert.equal(result.status, 0, `should accept: ${result.stderr || result.stdout}`);
  }
});

test('write-state rejects done flags that are not a true-prefix', () => {
  const root = tempWorkspace('write-state-invariant-gap');
  initialize(root);
  const result = runCli(['write-state'], root, stateWithMap('a', 2, [true, false, true]));
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.error.code, 'STATE_NODE_DONE_NOT_PREFIX');
});

test('write-state rejects current_node_idx that disagrees with done count', () => {
  const root = tempWorkspace('write-state-invariant-idx');
  initialize(root);
  const result = runCli(['write-state'], root, stateWithMap('a', 3, [true, false, false]));
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.error.code, 'STATE_NODE_IDX_MISMATCH');
  assert.equal(payload.error.details.expected, 2);
  assert.equal(payload.error.details.actual, 3);
});

test('write-state accepts YAML bool variants for done (True / TRUE / yes / quoted)', () => {
  const root = tempWorkspace('write-state-bool-variants');
  initialize(root);
  const variants = [
    `type: study-log\ngenerated_at: 2026-04-30\ncurrent_topic: a\ntopics:\n  - id: a\n    title: a\n    current_node_idx: 3\n    map:\n      - idx: 1\n        label: n1\n        done: True\n      - idx: 2\n        label: n2\n        done: TRUE\n      - idx: 3\n        label: n3\n        done: false\n`,
    `type: study-log\ngenerated_at: 2026-04-30\ncurrent_topic: a\ntopics:\n  - id: a\n    title: a\n    current_node_idx: 2\n    map:\n      - idx: 1\n        label: n1\n        done: yes\n      - idx: 2\n        label: n2\n        done: no\n`,
    `type: study-log\ngenerated_at: 2026-04-30\ncurrent_topic: a\ntopics:\n  - id: a\n    title: a\n    current_node_idx: 2\n    map:\n      - idx: 1\n        label: n1\n        done: "true"\n      - idx: 2\n        label: n2\n        done: "false"\n`,
  ];
  for (const input of variants) {
    const result = runCli(['write-state'], root, input);
    assert.equal(result.status, 0, `should accept variant: ${result.stderr || result.stdout}`);
  }
});

test('write-state accepts quoted integer for current_node_idx and idx', () => {
  const root = tempWorkspace('write-state-int-quoted');
  initialize(root);
  const input = `type: study-log\ngenerated_at: 2026-04-30\ncurrent_topic: a\ntopics:\n  - id: a\n    title: a\n    current_node_idx: "2"\n    map:\n      - idx: "1"\n        label: n1\n        done: true\n      - idx: "2"\n        label: n2\n        done: false\n`;
  const result = runCli(['write-state'], root, input);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('write-state still catches inconsistency when bools are uppercase', () => {
  const root = tempWorkspace('write-state-bool-uppercase-bad');
  initialize(root);
  const input = `type: study-log\ngenerated_at: 2026-04-30\ncurrent_topic: a\ntopics:\n  - id: a\n    title: a\n    current_node_idx: 2\n    map:\n      - idx: 1\n        label: n1\n        done: True\n      - idx: 2\n        label: n2\n        done: True\n      - idx: 3\n        label: n3\n        done: false\n`;
  const result = runCli(['write-state'], root, input);
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.error.code, 'STATE_NODE_IDX_MISMATCH');
  assert.equal(payload.error.details.expected, 3);
});
