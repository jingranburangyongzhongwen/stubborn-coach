const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { validateBashCommand } = require('../bin/lib/paths');
const { chunkPlan, densityOk } = require('../bin/lib/pdf');
const { saveExtracted, mergeExtracted } = require('../bin/lib/pdf-cli');
const { tempWorkspace } = require('./helpers');

test('chunkPlan splits pages into 10-page parts', () => {
  assert.deepEqual(chunkPlan(5),  [{ part: 1, pages: '1-5' }]);
  assert.deepEqual(chunkPlan(10), [{ part: 1, pages: '1-10' }]);
  assert.deepEqual(chunkPlan(11), [{ part: 1, pages: '1-10' }, { part: 2, pages: '11-11' }]);
  assert.deepEqual(chunkPlan(25), [
    { part: 1, pages: '1-10' },
    { part: 2, pages: '11-20' },
    { part: 3, pages: '21-25' },
  ]);
  assert.equal(chunkPlan(0).length, 0);
});

test('densityOk separates text-layer PDFs from scans', () => {
  assert.equal(densityOk('a'.repeat(60), 1), true);
  assert.equal(densityOk('a'.repeat(40), 1), false);
  assert.equal(densityOk('a'.repeat(600), 10), true);
  // whitespace doesn't count
  assert.equal(densityOk(' \n'.repeat(1000), 5), false);
  assert.equal(densityOk('whatever', 0), false);
});

test('path guard accepts pdf-extraction subcommands', () => {
  assert.equal(validateBashCommand("stubborn-coach extract-pdf --name foo <<'PATH'\nD:\\path\\to\\my [paper] (v2).pdf\nPATH"), true);
  assert.equal(validateBashCommand("stubborn-coach extract-pdf --name fps_survey <<'PATH'\n/home/u/papers/foo.pdf\nPATH"), true);
  assert.equal(validateBashCommand('stubborn-coach merge-extracted --name fps-survey'), true);
  assert.equal(validateBashCommand("stubborn-coach save-extracted --name fps-survey --part 1 <<'PART'\n# page 1\nhello\nPART"), true);
  // cd prefix still works:
  assert.equal(validateBashCommand("cd \"D:\\proj\" && stubborn-coach extract-pdf --name foo <<'PATH'\nD:\\foo.pdf\nPATH"), true);
});

test('path guard rejects malformed pdf-extraction arguments', () => {
  assert.throws(() => validateBashCommand("stubborn-coach extract-pdf --name ../escape <<'X'\nfoo.pdf\nX"), /name|may only contain/);
  assert.throws(() => validateBashCommand("stubborn-coach extract-pdf --name foo/bar <<'X'\nfoo.pdf\nX"), /name|may only contain/);
  assert.throws(() => validateBashCommand("stubborn-coach extract-pdf --file source-files/foo.pdf <<'X'\nfoo.pdf\nX"), /extract-pdf|--name/);
  assert.throws(() => validateBashCommand('stubborn-coach merge-extracted --name foo/bar'), /may only contain|basename|--name/);
  assert.throws(() => validateBashCommand('stubborn-coach merge-extracted --name ../escape'), /may only contain|basename|--name/);
  assert.throws(() => validateBashCommand("stubborn-coach save-extracted --name foo --part abc <<'X'\nhi\nX"), /digit/);
  assert.throws(() => validateBashCommand("stubborn-coach save-extracted --name foo <<'X'\nhi\nX"), /save-extracted/);
});

test('save-extracted writes a part file under source-files/', () => {
  const root = fs.realpathSync.native(tempWorkspace('pdf-save'));
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const result = saveExtracted({ name: 'survey', part: '2' }, '# Page 11\nhello world\n');
    assert.equal(result.status, 'part_saved');
    const expectedAbs = path.join(root, 'source-files', '.survey.part-002.txt');
    assert(fs.existsSync(expectedAbs), 'part file should be written');
    const written = fs.readFileSync(expectedAbs, 'utf8');
    assert.match(written, /Page 11/);
    // re-saving the same part is idempotent (no overwrite, no error)
    const again = saveExtracted({ name: 'survey', part: '2' }, 'different content');
    assert.equal(again.status, 'part_exists');
    const stillSame = fs.readFileSync(expectedAbs, 'utf8');
    assert.match(stillSame, /Page 11/);
  } finally {
    process.chdir(cwd);
  }
});

test('merge-extracted concatenates contiguous parts and removes them', () => {
  const root = fs.realpathSync.native(tempWorkspace('pdf-merge'));
  const cwd = process.cwd();
  process.chdir(root);
  try {
    saveExtracted({ name: 'doc', part: '1' }, 'alpha');
    saveExtracted({ name: 'doc', part: '2' }, 'beta');
    saveExtracted({ name: 'doc', part: '3' }, 'gamma');
    const result = mergeExtracted({ name: 'doc' });
    assert.equal(result.status, 'merged');
    assert.equal(result.parts, 3);
    const merged = fs.readFileSync(path.join(root, 'source-files', 'doc.txt'), 'utf8');
    assert.match(merged, /alpha\n\nbeta\n\ngamma/);
    // all part files are gone
    const remaining = fs.readdirSync(path.join(root, 'source-files'))
      .filter((name) => name.startsWith('.doc.part-'));
    assert.deepEqual(remaining, []);
  } finally {
    process.chdir(cwd);
  }
});

test('merge-extracted refuses when parts are non-contiguous', () => {
  const root = fs.realpathSync.native(tempWorkspace('pdf-merge-gap'));
  const cwd = process.cwd();
  process.chdir(root);
  try {
    saveExtracted({ name: 'doc', part: '1' }, 'alpha');
    saveExtracted({ name: 'doc', part: '3' }, 'gamma');
    assert.throws(() => mergeExtracted({ name: 'doc' }), /missing|incomplete|PARTS/i);
  } finally {
    process.chdir(cwd);
  }
});

test('save-extracted rejects bad inputs at CLI layer', () => {
  const root = fs.realpathSync.native(tempWorkspace('pdf-save-bad'));
  const cwd = process.cwd();
  process.chdir(root);
  try {
    assert.throws(() => saveExtracted({ name: '../escape', part: '1' }, 'hi'), /name/);
    assert.throws(() => saveExtracted({ name: 'ok', part: 'abc' }, 'hi'), /part|digit/);
    assert.throws(() => saveExtracted({ name: 'ok', part: '1' }, ''), /EMPTY_STDIN|empty|stdin/i);
  } finally {
    process.chdir(cwd);
  }
});
