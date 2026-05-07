#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const evals = JSON.parse(fs.readFileSync(path.join(__dirname, 'trigger-evals.json'), 'utf8'));

let failures = 0;
for (const item of evals) {
  const skillPath = path.join(root, 'skills', item.expected_skill, 'SKILL.md');
  const content = fs.readFileSync(skillPath, 'utf8').toLowerCase();
  const prompt = item.prompt.toLowerCase();
  const tokens = prompt.split(/\s+/).filter((token) => token.length > 1);
  const covered = tokens.some((token) => content.includes(token)) || content.includes(item.expected_skill);
  if (!covered) {
    failures += 1;
    console.error(`FAIL ${item.expected_skill}: ${item.prompt}`);
  } else {
    console.log(`PASS ${item.expected_skill}: ${item.prompt}`);
  }
}

process.exit(failures ? 1 : 0);
