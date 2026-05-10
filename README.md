# stubborn-coach

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Terminal-first interactive learning mentor for Claude Code. One skill, one user-facing study file, one internal state file, one isolation-only subagent — and nothing else.

![logo](./imgs/post.png)

## What It Provides

`/stubborn-coach:study` 是唯一公开入口，覆盖**学习 / 复习 / 测验 / 查询 / 状态 / 导出**全部语义：

```
/stubborn-coach:study <topic | URL | 本地文件 | PDF | 粘贴文本>
```

- 教学循环全部在终端进行，**不需要切窗、不需要打开 markdown**
- 知识库写入 `learning-wiki/study.md`（可读、可 git 化）；进度状态写入 `learning-wiki/.study-state.yml`
- 通过节点需要提供**解释 / 例子 / 应用**之一作为证据——说"我懂了"不算

## Quick Start

**前置依赖**：[Claude Code](https://claude.ai/code) + Node.js ≥ 18 + npm

```bash
# 1. 进入你的学习目录（任意 workspace 均可）
cd ~/my-learning

# 2. 安装插件
claude plugins install https://github.com/jingranburangyongzhongwen/stubborn-coach

# 3. 学一个 topic
/stubborn-coach:study Transformer 注意力机制

# 4. 扔一篇论文
/stubborn-coach:study /path/to/paper.pdf

# 5. 第二天什么都不带，自动接续 / 触发到期复习
/stubborn-coach:study
```

首次读写学习文件时，插件会自动在 workspace 下创建 `learning-wiki/` 和 `source-files/`；不需要手动初始化。

PDF 处理依赖外部 [docling](https://github.com/DS4SD/docling) CLI；插件**不会自动安装**——请按 docling 官方文档自行安装到合适的 Python 环境（通常用独立 venv / conda env），把该环境的 `Scripts/`（Windows）或 `bin/`（macOS / Linux）加入 PATH，或设环境变量 `STUBBORN_COACH_DOCLING` 指向 docling 可执行文件的绝对路径。docling 提供 layout / OCR / 表格识别 / 公式 LaTeX / 双栏合并，输出高质量 markdown。

## How It Works

**探查状态机**：说"检查一下"触发多轮探查。每题更新两个账本：
- **广度**：当前节点每个 key_point 标 `ok / weak / untested`
- **深度**：`accurate / explained / applied / discriminated` 四维累积

`familiar` 目标需广度 + 前两维过线；`mastered` 还要求 `applied` 或 `discriminated` 至少 `ok`。预算上限：节点 6 题 / topic 8 题，未耗尽且账本未闭合就继续问。

**subagent 隔离长源**：PDF / 长 URL / 长粘贴交给独立 subagent 消化，只把结构化 `source_summary` 返回主流程——原文不进主对话，彻底杜绝上下文污染和漂移。

**SM-2 间隔复习**：通过的节点自动排出 `next_review`，无参数启动时自动提示到期项。

**双文件分离**：`study.md` 只存稳定教案（主题 / 节点讲义 / 错题），动态进度全在 YAML——两者不混，`study.md` 可当永久教材。

## Why So Small

历史上插件曾经有 5 个 skill、4 个 subagent、6 个 CLI writer、3 个目录的产物。这一次彻底回到第一性原理：

- 一个 skill 入口足够——LLM 主流程根据用户输入自动路由到 5 类语义
- 源接入必须隔离在 subagent；探查在主流程内进行，靠 IRON LAW、4 维 rubric 与结构化 `last_probe` 控制长期记忆污染
- `study.md` 只保留稳定教案内容，进度、探查结果、SM-2 等动态状态放到隐藏 YAML，避免用户正文和机器状态互相漂移
- 默认不联网丰富内容；外部事实必须来自 WebFetch 页面或本地源文件，并用 `topics[].citations` 追溯来源

## Similar Product Comparison

`stubborn-coach` 在六件事上同时拉满，这是其他方案没有同时做到的（★ 核心；△ 部分；✗ 不支持；— 不适用）：

| 能力 | `stubborn-coach` | 网页 LLM | `claude-tutor` | `tutor-skills` | `paper-mentor` | `sanyuan` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| 终端单 slash 闭环（无切窗、无 UI） | ★ | ✗ | △ | △ | △ | ✗ |
| 双文件本地落盘，可 git 化 | ★ | ✗ | △ | △ | △ | △ |
| rubric + `last_probe` + SM-2 决定晋级与复习 | ★ | ✗ | △ | ✗ | △ | △ |
| 长源 subagent 隔离，不污染主上下文 | ★ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 写入路径白名单 + hook 防 diff 噪音 | ★ | — | △ | ✗ | ✗ | ✗ |
| 默认不联网，引用强制 `citations` 追溯 | ★ | ✗ | △ | △ | △ | △ |

> 「网页 LLM」指 ChatGPT Study Mode、Claude Learning Mode、Kimi 等聊天网页的学习辅导模式。
> 其中**「长源 subagent 隔离」是独有的**：其他方案都把整篇 PDF/URL 灌进对话，后续追问被原文反复拉回去。
> 真正的优势不在某一项最强，而在这六项**同时**成立——构成一个能持续学几周不打断、不漂移、不污染上下文的终端学习闭环。

---

## For Contributors

<details>
<summary>Architecture</summary>

```
skills/study/SKILL.md              # 主流程；唯一公开 slash command；用隐藏 CLI 持久化双文件
skills/study/references/
  schema.md                        # .study-state.yml 字段表 + study.md 知识库结构 + citations
  examples.md                      # 首轮输出示例
  probing.md                       # 探查动作、rubric、verdict 与 last_probe 契约
  persistence.md                   # 落盘协议：CLI 命令、heredoc stdin 格式、本轮结构
agents/source-ingest.md            # subagent：长 URL/PDF/文本接入
hooks/enforce-workspace-paths.js   # Bash 白名单；Read 自动初始化；拦截 Write/Edit/MultiEdit 防 diff
bin/stubborn-coach                 # CLI（无公开命令；隐藏 write-state/add-* 供 skill 落盘）
templates/study.md                 # 自动初始化复制的初始用户知识库模板
templates/study-state.yml          # 自动初始化复制的初始内部状态模板
evals/, tests/                     # 触发评测 + 单元测试
```

</details>

<details>
<summary>Local State</summary>

```
learning-wiki/study.md             # 用户可读知识库 / 教案，只追加主题、节点讲义、错题
learning-wiki/.study-state.yml     # 内部机器状态：current_topic、topics、last_probe、SM-2、citations 等
source-files/                      # 用户上传源文件（可选）
```

任何 hook / writer 都拒绝写入除上述路径外的位置。

</details>

<details>
<summary>Subagents</summary>

| Subagent | 何时被主流程调起 | 隔离价值 |
|---|---|---|
| `stubborn-coach:source-ingest` | ≥ 5000 字 URL / 长 PDF / 长粘贴文本 | 长源原文不进主上下文，只回结构化 `source_summary` |

短 URL、本地短文件、topic 入口由主流程直接处理，不调 subagent。

</details>

<details>
<summary>CLI 隐藏命令</summary>

CLI 不暴露初始化命令；学习文件由 Read hook / writer 自动创建。另有五条隐藏内部命令，只供 `study` skill 通过 heredoc 落盘：

- `stubborn-coach write-state`：全量覆盖 `learning-wiki/.study-state.yml`
- `stubborn-coach add-topic --id <topic-id>`：在 `study.md` 末尾追加主题骨架
- `stubborn-coach add-node --topic <topic-id> --idx <n>`：在指定主题末尾追加节点讲义
- `stubborn-coach add-mistake --topic <topic-id> --node <n>`：在指定节点追加错题
- `stubborn-coach extract-source --name <basename>`：调本地 docling 把二进制源（PDF / DOCX / PPTX / XLSX / 图像）或 PDF URL 转成 `source-files/<basename>.md`；路径或 URL 走 stdin heredoc，可容纳带空格 / 方括号 / 中文的文件名

</details>

<details>
<summary>运行测试</summary>

```bash
node --test stubborn-coach/tests/*.test.js
node stubborn-coach/evals/run-trigger-eval.js
node stubborn-coach/evals/run-functional-eval.js
```

</details>
