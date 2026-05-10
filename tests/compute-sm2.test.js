const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const test = require('node:test');

const CLI = path.join(__dirname, '..', 'bin', 'stubborn-coach');

function runSm2(flags) {
  return spawnSync(process.execPath, [CLI, 'compute-sm2', ...flags], { encoding: 'utf8' });
}

function parse(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('first successful review (quality=4, defaults) → interval 1, reps 1', () => {
  const out = parse(runSm2(['--quality', '4', '--ease', '2.5', '--interval', '0', '--reps', '0', '--today', '2026-05-10']));
  assert.equal(out.ok, true);
  assert.equal(out.interval_days, 1);
  assert.equal(out.repetitions, 1);
  assert.equal(out.ease_factor, 2.5);
  assert.equal(out.next_review, '2026-05-11');
  assert.equal(out.status, 'met_target');
});

test('second review (quality=5, reps=1) → interval 6', () => {
  const out = parse(runSm2(['--quality', '5', '--ease', '2.5', '--interval', '1', '--reps', '1', '--today', '2026-05-11']));
  assert.equal(out.interval_days, 6);
  assert.equal(out.repetitions, 2);
  assert.equal(out.next_review, '2026-05-17');
  assert.equal(out.status, 'met_target');
});

test('second review (quality=4, reps=1) → interval 3', () => {
  const out = parse(runSm2(['--quality', '4', '--ease', '2.5', '--interval', '1', '--reps', '1', '--today', '2026-05-11']));
  assert.equal(out.interval_days, 3);
  assert.equal(out.repetitions, 2);
  assert.equal(out.next_review, '2026-05-14');
});

test('third review uses ease * interval', () => {
  const out = parse(runSm2(['--quality', '4', '--ease', '2.5', '--interval', '6', '--reps', '2', '--today', '2026-05-17']));
  assert.equal(out.interval_days, 15);
  assert.equal(out.repetitions, 3);
  assert.equal(out.ease_factor, 2.5);
  assert.equal(out.next_review, '2026-06-01');
});

test('quality=3 gives in_progress status', () => {
  const out = parse(runSm2(['--quality', '3', '--ease', '2.5', '--interval', '0', '--reps', '0', '--today', '2026-05-10']));
  assert.equal(out.status, 'in_progress');
  assert.equal(out.interval_days, 1);
  assert.equal(out.repetitions, 1);
});

test('quality < 3 resets reps and interval', () => {
  const out = parse(runSm2(['--quality', '2', '--ease', '2.5', '--interval', '15', '--reps', '3', '--today', '2026-05-10']));
  assert.equal(out.interval_days, 1);
  assert.equal(out.repetitions, 0);
  assert.equal(out.next_review, '2026-05-11');
  assert.equal(out.status, 'needs_review');
});

test('quality=0 gives needs_review', () => {
  const out = parse(runSm2(['--quality', '0', '--ease', '2.5', '--interval', '6', '--reps', '2', '--today', '2026-05-10']));
  assert.equal(out.status, 'needs_review');
  assert.equal(out.repetitions, 0);
  assert.equal(out.interval_days, 1);
});

test('ease factor decreases on quality=3 but stays above 1.3', () => {
  const out = parse(runSm2(['--quality', '3', '--ease', '1.4', '--interval', '6', '--reps', '2', '--today', '2026-05-10']));
  assert.equal(out.ease_factor, 1.3);
});

test('ease factor increases on quality=5', () => {
  const out = parse(runSm2(['--quality', '5', '--ease', '2.5', '--interval', '6', '--reps', '2', '--today', '2026-05-10']));
  assert.equal(out.ease_factor, 2.6);
});

test('rejects quality out of range', () => {
  const r1 = runSm2(['--quality', '6', '--ease', '2.5', '--interval', '0', '--reps', '0', '--today', '2026-05-10']);
  assert.notEqual(r1.status, 0);
  assert.match(r1.stdout, /0 to 5/);

  const r2 = runSm2(['--quality', '-1', '--ease', '2.5', '--interval', '0', '--reps', '0', '--today', '2026-05-10']);
  assert.notEqual(r2.status, 0);
});

test('rejects invalid date format', () => {
  const result = runSm2(['--quality', '4', '--ease', '2.5', '--interval', '0', '--reps', '0', '--today', '05-10-2026']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /YYYY-MM-DD/);
});

test('rejects missing arguments', () => {
  const result = runSm2(['--quality', '4', '--ease', '2.5']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /expected arguments/);
});

test('minimum interval is 1 even with very low ease * interval', () => {
  const out = parse(runSm2(['--quality', '3', '--ease', '1.3', '--interval', '0', '--reps', '0', '--today', '2026-05-10']));
  assert(out.interval_days >= 1);
});
