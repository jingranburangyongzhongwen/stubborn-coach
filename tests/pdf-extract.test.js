const assert = require('assert');
const test = require('node:test');
const { validateBashCommand } = require('../bin/lib/paths');

test('path guard accepts extract-source with file path on stdin', () => {
  assert.equal(validateBashCommand("stubborn-coach extract-source --name foo <<'SRC'\nD:\\path\\to\\my [paper] (v2).pdf\nSRC"), true);
  assert.equal(validateBashCommand("stubborn-coach extract-source --name fps_survey <<'SRC'\n/home/u/papers/foo.pdf\nSRC"), true);
  assert.equal(validateBashCommand("stubborn-coach extract-source --name slides <<'SRC'\n/home/u/decks/intro.pptx\nSRC"), true);
  // cd prefix still works:
  assert.equal(validateBashCommand("cd \"D:\\proj\" && stubborn-coach extract-source --name foo <<'SRC'\nD:\\foo.pdf\nSRC"), true);
});

test('path guard accepts extract-source with http(s) URL on stdin', () => {
  assert.equal(validateBashCommand("stubborn-coach extract-source --name arxiv_2206_01062 <<'SRC'\nhttps://arxiv.org/pdf/2206.01062\nSRC"), true);
  assert.equal(validateBashCommand("stubborn-coach extract-source --name docs_intro <<'SRC'\nhttp://example.com/whitepaper.pdf\nSRC"), true);
  // URLs with query strings (`?`, `&`, `=`) must pass the heredoc body too.
  assert.equal(validateBashCommand("stubborn-coach extract-source --name with_query <<'SRC'\nhttps://example.com/dl?id=42&fmt=pdf\nSRC"), true);
});

test('path guard rejects malformed extract-source arguments', () => {
  assert.throws(() => validateBashCommand("stubborn-coach extract-source --name ../escape <<'X'\nfoo.pdf\nX"), /name|may only contain/);
  assert.throws(() => validateBashCommand("stubborn-coach extract-source --name foo/bar <<'X'\nfoo.pdf\nX"), /name|may only contain/);
  assert.throws(() => validateBashCommand("stubborn-coach extract-source --file source-files/foo.pdf <<'X'\nfoo.pdf\nX"), /extract-source|--name/);
});
