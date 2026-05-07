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

function writeState(root, { currentNodeIdx, done1 }) {
  const yaml = [
    'type: study-log',
    'topics:',
    '  - id: test-topic',
    `    current_node_idx: ${currentNodeIdx}`,
    '    map:',
    '      - idx: 1',
    `        done: ${done1}`,
    '      - idx: 2',
    '        done: false',
  ].join('\n');
  assert.equal(runCli(['write-state'], root, yaml).status, 0);
}

function initWithTopic(root, { passNode1 = true } = {}) {
  assert.equal(runCli(['init'], root).status, 0);
  const topic = [
    '### 测试主题',
    '',
    '#### 学习目标',
    '- 能解释核心概念',
    '',
    '#### 学习地图',
    '- 1. 基本含义',
    '- 2. 延伸应用',
    '',
    '#### 节点讲义',
    '',
    '##### 1. 基本含义',
    '第一节点讲义。',
    '',
  ].join('\n');
  assert.equal(runCli(['add-topic', '--id', 'test-topic'], root, topic).status, 0);
  writeState(root, { currentNodeIdx: passNode1 ? 2 : 1, done1: passNode1 });
}

function nodeBody(idx = 2) {
  return `##### ${idx}. 延伸应用\n第二节点讲义。\n`;
}

test('add-node appends the next node inside the topic without touching earlier bytes', () => {
  const root = tempWorkspace('add-node-valid');
  initWithTopic(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  const before = fs.readFileSync(studyPath, 'utf8');
  const result = runCli(['add-node', '--topic', 'test-topic', '--idx', '2'], root, nodeBody(2));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = fs.readFileSync(studyPath, 'utf8');
  assert.strictEqual(after.slice(0, before.length), before);
  assert(after.includes('<!-- node:2 -->\n##### 2. 延伸应用'));
});

test('add-node rejects duplicate, skipped, or missing topic writes', () => {
  const root = tempWorkspace('add-node-invalid-order');
  initWithTopic(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  const before = fs.readFileSync(studyPath, 'utf8');

  let result = runCli(['add-node', '--topic', 'test-topic', '--idx', '1'], root, '##### 1. 基本含义\n重复。\n');
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, 'NODE_EXISTS');

  result = runCli(['add-node', '--topic', 'test-topic', '--idx', '3'], root, '##### 3. 跳号\n跳号。\n');
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, 'NODE_IDX_MISMATCH');

  result = runCli(['add-node', '--topic', 'missing-topic', '--idx', '2'], root, nodeBody(2));
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, 'TOPIC_NOT_FOUND');
  assert.strictEqual(fs.readFileSync(studyPath, 'utf8'), before);
});

test('add-node validates idx and heading consistency', () => {
  const root = tempWorkspace('add-node-invalid-shape');
  initWithTopic(root);
  assert.notEqual(runCli(['add-node', '--topic', 'test-topic', '--idx', '100'], root, nodeBody(100)).status, 0);
  assert.notEqual(runCli(['add-node', '--topic', 'test-topic', '--idx', '2'], root, '##### 3. 不一致\n内容。\n').status, 0);
  assert.notEqual(runCli(['add-node', '--topic', 'test-topic', '--idx', '2'], root, `${nodeBody(2)}<!-- node:2 -->\n`).status, 0);
});

test('add-node refuses to write node N when state.yml has not passed node N-1', () => {
  const root = tempWorkspace('add-node-state-prereq');
  initWithTopic(root, { passNode1: false });
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  const before = fs.readFileSync(studyPath, 'utf8');
  const result = runCli(['add-node', '--topic', 'test-topic', '--idx', '2'], root, nodeBody(2));
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, 'NODE_PREREQUISITE_NOT_DONE');
  assert.strictEqual(fs.readFileSync(studyPath, 'utf8'), before);
});
