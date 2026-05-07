#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'stubborn-coach');
const hook = path.join(root, 'hooks', 'enforce-workspace-paths.js');
const evals = JSON.parse(fs.readFileSync(path.join(__dirname, 'functional-evals.json'), 'utf8'));

let failures = 0;

for (const item of evals) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stubborn-coach-eval-'));
  let ok = true;
  let reason = '';
  try {
    if (item.hook) {
      const result = spawnSync(process.execPath, [hook], {
        cwd: workspace,
        input: JSON.stringify(item.hook),
        encoding: 'utf8',
      });
      if (result.status !== item.expect_exit) {
        ok = false;
        reason = `expected exit ${item.expect_exit}, got ${result.status}`;
      }
    } else {
      const result = spawnSync(process.execPath, [cli, item.command], {
        cwd: workspace,
        input: item.input ? JSON.stringify(item.input) : '',
        encoding: 'utf8',
      });
      let payload = {};
      try {
        payload = JSON.parse(result.stdout || '{}');
      } catch (_) {
        payload = {};
      }
      const expectOk = item.expect_ok !== false;
      if (expectOk) {
        if (!(payload.ok === true && result.status === 0)) {
          ok = false;
          reason = `expected ok, got status=${result.status} stdout=${result.stdout}`;
        }
      } else {
        if (!(payload.ok === false && result.status !== 0)) {
          ok = false;
          reason = `expected failure, got status=${result.status} stdout=${result.stdout}`;
        }
      }
      if (ok && Array.isArray(item.expect)) {
        for (const relative of item.expect) {
          if (!fs.existsSync(path.join(workspace, relative))) {
            ok = false;
            reason = `expected ${relative} to exist`;
            break;
          }
        }
      }
      if (ok && Array.isArray(item.expect_missing)) {
        for (const relative of item.expect_missing) {
          if (fs.existsSync(path.join(workspace, relative))) {
            ok = false;
            reason = `expected ${relative} to be absent`;
            break;
          }
        }
      }
    }
  } catch (error) {
    ok = false;
    reason = error.message;
  } finally {
    try { fs.rmSync(workspace, { recursive: true, force: true }); } catch (_) {}
  }
  if (ok) {
    console.log(`PASS ${item.name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${item.name}: ${reason}`);
  }
}

process.exit(failures ? 1 : 0);
