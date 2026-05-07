#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { resolveWorkspacePath, validateBashCommand } = require('../bin/lib/paths');

function readHookInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch (_) {
    return {};
  }
}

function filePathsFor(input) {
  const toolInput = input.tool_input || {};
  const paths = [];
  if (toolInput.file_path) paths.push(toolInput.file_path);
  if (toolInput.path) paths.push(toolInput.path);
  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (edit.file_path) paths.push(edit.file_path);
      if (edit.path) paths.push(edit.path);
    }
  }
  return paths;
}

function block(error) {
  // Claude Code 协议：deny 必须用 stdout JSON + exit 0，exit 2 会被当作"hook 崩溃"忽略。
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `BLOCKED by stubborn-coach path guard: ${error.message}${error.details && Object.keys(error.details).length ? ` ${JSON.stringify(error.details)}` : ''}`,
    },
  }));
  // 同时打印到 stderr 以便人工调试（exit 2 让旧版 Claude Code / 其他 host 也能拦截）。
  process.stderr.write(`BLOCKED by stubborn-coach path guard: ${error.message}`);
  if (error.details && Object.keys(error.details).length) {
    process.stderr.write(` ${JSON.stringify(error.details)}`);
  }
  process.exit(2);
}

function allow(reason) {
  // 主动 auto-approve：bypass Claude Code 的权限确认 UI。
  // 走到这里说明已经过 validateBashCommand 或 resolveWorkspacePath 校验，路径白名单已确保安全。
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function isInsidePluginRoot(filePath) {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(pluginRoot);
  const rel = path.relative(rootResolved, resolved);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function main() {
  const input = readHookInput();
  const toolName = input.tool_name || input.tool || input.name || '';
  const toolInput = input.tool_input || {};

  try {
    if (toolName === 'Bash' || toolInput.command) {
      validateBashCommand(toolInput.command || '');
      allow('stubborn-coach whitelisted Bash command');
    }

    const paths = filePathsFor(input);

    if (toolName === 'Read') {
      if (paths.length === 0) process.exit(0);
      if (paths.every(isInsidePluginRoot)) {
        allow('stubborn-coach plugin files are auto-readable');
      }
      const allInWorkspace = paths.every((p) => {
        try {
          resolveWorkspacePath(p, { cwd: process.cwd() });
          return true;
        } catch (_) {
          return false;
        }
      });
      if (allInWorkspace) {
        allow('learning-wiki study files or source-files/** are on stubborn-coach read whitelist');
      }
      // 不属于插件 / workspace 的 Read（例如 ~/.claude memory、其它项目文件）：
      // 交给 Claude Code 自己的权限流决定，hook 不主动拦截。
      process.exit(0);
    }

    if (paths.length === 0) {
      process.exit(0);
    }
    for (const filePath of paths) {
      resolveWorkspacePath(filePath, { cwd: process.cwd() });
    }
    if (['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
      const error = new Error('Write/Edit/MultiEdit render file diffs in the terminal; use `stubborn-coach write-state` / `add-topic` / `add-node` / `add-mistake` for study persistence');
      error.code = 'WRITE_TOOL_NOT_ALLOWED';
      error.details = { allowed: 'stubborn-coach write-state | add-topic | add-node | add-mistake <<HEREDOC' };
      throw error;
    }
    allow('learning-wiki study files or source-files/** are on stubborn-coach read whitelist');
  } catch (error) {
    block(error);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  filePathsFor,
  main,
};
