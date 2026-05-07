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

function initWithTopic(root) {
  assert.equal(runCli(['init'], root).status, 0);
  const topic = [
    '### 测试主题',
    '',
    '#### 学习目标',
    '- 能解释核心概念',
    '',
    '#### 学习地图',
    '- 1. 基本含义',
    '',
    '#### 节点讲义',
    '',
    '##### 1. 基本含义',
    '第一节点讲义。',
    '',
  ].join('\n');
  assert.equal(runCli(['add-topic', '--id', 'test-topic'], root, topic).status, 0);
}

test('add-mistake creates the mistake section on first write', () => {
  const root = tempWorkspace('add-mistake-first');
  initWithTopic(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  const before = fs.readFileSync(studyPath, 'utf8');
  const result = runCli(['add-mistake', '--topic', 'test-topic', '--node', '1'], root, '- 把 A 误认为 B\n');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = fs.readFileSync(studyPath, 'utf8');
  assert.strictEqual(after.slice(0, before.length), before);
  assert(after.includes('<!-- mistakes:test-topic/1 -->\n###### 错题\n- 把 A 误认为 B\n'));
});

test('add-mistake appends repeated entries verbatim on later writes', () => {
  const root = tempWorkspace('add-mistake-repeat');
  initWithTopic(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  assert.equal(runCli(['add-mistake', '--topic', 'test-topic', '--node', '1'], root, '- 把 A 误认为 B\n').status, 0);
  const before = fs.readFileSync(studyPath, 'utf8');
  const result = runCli(['add-mistake', '--topic', 'test-topic', '--node', '1'], root, '- 把 A 误认为 B\n- 缺少边界条件\n');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = fs.readFileSync(studyPath, 'utf8');
  assert.strictEqual(after.slice(0, before.length), before);
  assert.match(after, /- 把 A 误认为 B\n- 把 A 误认为 B\n- 缺少边界条件\n$/);
});

test('add-mistake rejects missing topic/node and invalid list lines without changing file', () => {
  const root = tempWorkspace('add-mistake-invalid');
  initWithTopic(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  const before = fs.readFileSync(studyPath, 'utf8');

  let result = runCli(['add-mistake', '--topic', 'missing-topic', '--node', '1'], root, '- 错题\n');
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, 'TOPIC_NOT_FOUND');

  result = runCli(['add-mistake', '--topic', 'test-topic', '--node', '2'], root, '- 错题\n');
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, 'NODE_NOT_FOUND');

  assert.notEqual(runCli(['add-mistake', '--topic', 'test-topic', '--node', '1'], root, '# 标题\n').status, 0);
  assert.notEqual(runCli(['add-mistake', '--topic', 'test-topic', '--node', '1'], root, '- ok\n<!-- mistakes:x/1 -->\n').status, 0);
  assert.strictEqual(fs.readFileSync(studyPath, 'utf8'), before);
});
