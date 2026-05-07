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

function init(root) {
  const result = runCli(['init'], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function topicBody(title = '测试主题') {
  return [
    `### ${title}`,
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
}

test('add-topic appends topic and auto-inserts topic/node anchors', () => {
  const root = tempWorkspace('add-topic-valid');
  init(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  const before = fs.readFileSync(studyPath, 'utf8');
  const body = topicBody();
  const result = runCli(['add-topic', '--id', 'test-topic'], root, body);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = fs.readFileSync(studyPath, 'utf8');
  assert(after.startsWith(before));
  assert.strictEqual(after.slice(0, before.length), before);
  assert(after.includes('<!-- topic:test-topic -->\n### 测试主题'));
  assert(after.includes('<!-- node:1 -->\n##### 1. 基本含义'));
});

test('add-topic rejects duplicate id without changing the file', () => {
  const root = tempWorkspace('add-topic-duplicate');
  init(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  assert.equal(runCli(['add-topic', '--id', 'test-topic'], root, topicBody()).status, 0);
  const before = fs.readFileSync(studyPath, 'utf8');
  const result = runCli(['add-topic', '--id', 'test-topic'], root, topicBody('重复主题'));
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.error.code, 'TOPIC_EXISTS');
  assert.strictEqual(fs.readFileSync(studyPath, 'utf8'), before);
});

test('add-topic validates args and stdin shape', () => {
  const root = tempWorkspace('add-topic-invalid');
  init(root);
  assert.notEqual(runCli(['add-topic', '--id', 'BadId'], root, topicBody()).status, 0);
  assert.notEqual(runCli(['add-topic', '--topic', 'test-topic'], root, topicBody()).status, 0);
  assert.notEqual(runCli(['add-topic', '--id', 'test-topic'], root, '#### 不是主题\n').status, 0);
  assert.notEqual(runCli(['add-topic', '--id', 'test-topic'], root, `${topicBody()}<!-- topic:x -->\n`).status, 0);
  assert.notEqual(runCli(['add-topic', '--id', 'test-topic'], root, '### 缺节点\n').status, 0);
});
