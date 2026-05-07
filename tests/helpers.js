const fs = require('fs');
const os = require('os');
const path = require('path');

function tempWorkspace(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `stubborn-coach-${name}-`));
}

module.exports = { tempWorkspace };
