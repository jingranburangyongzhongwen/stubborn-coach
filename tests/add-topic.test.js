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
  initialize(root);
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
  initialize(root);
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
  initialize(root);
  assert.notEqual(runCli(['add-topic', '--id', 'BadId'], root, topicBody()).status, 0);
  assert.notEqual(runCli(['add-topic', '--topic', 'test-topic'], root, topicBody()).status, 0);
  assert.notEqual(runCli(['add-topic', '--id', 'test-topic'], root, '没有任何 heading\n').status, 0);
  assert.notEqual(runCli(['add-topic', '--id', 'test-topic'], root, `${topicBody()}<!-- topic:x -->\n`).status, 0);
  assert.notEqual(runCli(['add-topic', '--id', 'test-topic'], root, '### 缺节点\n').status, 0);
});

test('add-topic accepts any consistent heading depth and normalizes to ### / #####', () => {
  const root = tempWorkspace('add-topic-shifted');
  initialize(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');

  // Author wrote everything one level shallower (## title, #### node 1).
  const shallow = [
    '## 浅一级主题',
    '',
    '### 学习目标',
    '- 能解释核心概念',
    '',
    '### 学习地图',
    '- 1. 基本含义',
    '',
    '### 节点讲义',
    '',
    '#### 1. 基本含义',
    '第一节点讲义。',
    '',
  ].join('\n');
  const result = runCli(['add-topic', '--id', 'shallow-topic'], root, shallow);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = fs.readFileSync(studyPath, 'utf8');
  assert(after.includes('<!-- topic:shallow-topic -->\n### 浅一级主题'));
  assert(after.includes('#### 学习目标'));
  assert(after.includes('<!-- node:1 -->\n##### 1. 基本含义'));
});

test('add-topic forces numbered node headings to h5 even when delta is wrong', () => {
  const root = tempWorkspace('add-topic-mismatched-delta');
  initialize(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');

  // Author wrote topic at ## but nodes only one level deeper (### 1. ...), which
  // is the most common real-world mistake. Linear shift alone would land nodes
  // at #### — numbered-heading pinning must save it.
  const body = [
    '## 失衡主题',
    '',
    '### 学习目标',
    '- 能解释',
    '',
    '### 学习地图',
    '- 1. 第一节点',
    '',
    '### 节点讲义',
    '',
    '### 1. 第一节点',
    '第一节点讲义。',
    '',
  ].join('\n');
  const result = runCli(['add-topic', '--id', 'mismatched-topic'], root, body);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = fs.readFileSync(studyPath, 'utf8');
  assert(after.includes('<!-- topic:mismatched-topic -->\n### 失衡主题'));
  assert(after.includes('<!-- node:1 -->\n##### 1. 第一节点'));
});

test('add-topic accepts plain title line (no #) per recommended schema', () => {
  const root = tempWorkspace('add-topic-plain-title');
  initialize(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  const body = [
    '质能方程 (E=mc²)',
    '',
    '## 学习目标',
    '- 能用自己的话解释 E=mc²',
    '',
    '## 学习地图',
    '- 1. 基本含义',
    '',
    '## 节点讲义',
    '',
    '### 1. 基本含义',
    '第一节点讲义。',
    '',
  ].join('\n');
  const result = runCli(['add-topic', '--id', 'e-mc2'], root, body);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = fs.readFileSync(studyPath, 'utf8');
  assert(after.includes('<!-- topic:e-mc2 -->\n### 质能方程 (E=mc²)'));
  assert(after.includes('#### 学习目标'));
  assert(after.includes('#### 节点讲义'));
  assert(after.includes('<!-- node:1 -->\n##### 1. 基本含义'));
});

test('add-topic preserves # / ## / ##### inside fenced code blocks', () => {
  const root = tempWorkspace('add-topic-fenced-code');
  initialize(root);
  const studyPath = path.join(root, 'learning-wiki', 'study.md');
  const body = [
    '代码示例主题',
    '',
    '## 学习目标',
    '- 学会读 Python 注释',
    '',
    '## 学习地图',
    '- 1. 基本含义',
    '',
    '## 节点讲义',
    '',
    '### 1. 基本含义',
    '',
    '看下面 Python 示例，注释一定不能被改写：',
    '',
    '```python',
    '# initialize the model',
    '## not really a heading',
    '##### 1. fake node — must NOT become an anchor target',
    'model = build()',
    '```',
    '',
    '段落里普通的 `## 字面量` 也应保留。',
    '',
  ].join('\n');
  const result = runCli(['add-topic', '--id', 'code-topic'], root, body);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = fs.readFileSync(studyPath, 'utf8');
  // Outside-fence headings get normalized as before.
  assert(after.includes('<!-- topic:code-topic -->\n### 代码示例主题'));
  assert(after.includes('#### 学习目标'));
  assert(after.includes('<!-- node:1 -->\n##### 1. 基本含义'));
  // Inside-fence content survives byte-for-byte.
  assert(after.includes('# initialize the model'));
  assert(after.includes('## not really a heading'));
  assert(after.includes('##### 1. fake node — must NOT become an anchor target'));
  // The fake node-1 line inside the code block must NOT have triggered anchor injection.
  const anchorCount = (after.match(/<!-- node:1 -->/g) || []).length;
  assert.equal(anchorCount, 1, 'exactly one node:1 anchor should be injected (the real heading)');
});
