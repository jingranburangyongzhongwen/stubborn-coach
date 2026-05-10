# 落盘协议

不要调用 Write/Edit/MultiEdit 写 `study.md` 或 `.study-state.yml`。只能用四条隐藏 CLI（heredoc 喂 stdin，stdout 一行 JSON、无 diff）：

- `stubborn-coach write-state` — 全量覆盖 `.study-state.yml`（YAML 顶部 `type: study-log`，漏写 CLI 自动补）
- `stubborn-coach add-topic --id <kebab>` — 追加新 topic 骨架（自动注入 node:1 锚）
- `stubborn-coach add-node --topic <kebab> --idx <n>` — 追加节点 N 讲义；CLI 会反向校验 state.yml 的 done[N-1]=true
- `stubborn-coach add-mistake --topic <kebab> --node <n>` — 追加错题列表项

另有一条无 stdin 的计算命令：

- `stubborn-coach compute-sm2 --quality <0-5> --ease <num> --interval <int> --reps <int> --today <YYYY-MM-DD>` — 确定性计算 SM-2，stdout JSON 包含 next_review / interval_days / repetitions / ease_factor / status

每条 CLI 必须**单独**调用一次 Bash tool。严禁在同一个 Bash 输入里用换行 / `;` / `&&` / 连续 heredoc 拼接两条 `stubborn-coach` 写入命令，否则 path guard 会拦截。完整 stdin 格式见 `schema.md`。

**工作目录**：所有 `stubborn-coach` 命令必须在用户的**工作空间根目录**下执行（包含 `learning-wiki/` 和 `source-files/` 的目录）。**禁止**在插件源码目录（如 `skills/study/`）下执行。

## stdin 格式速查

**write-state**（YAML）：
```yaml
type: study-log
current_topic: <topic-id>
topics:
  - id: <topic-id>
    title: "..."
    target_depth: familiar
    current_node_idx: 1
    map:
      - idx: 1
        label: "..."
        done: false
        key_points:
          - "..."
    status: in_progress
    key_points:
      - "..."
    last_probe: {}
```

**add-topic**（markdown，首行是标题，必须包含节点 1 讲义）：
```markdown
主题标题（纯文本，不带 #）

## 学习目标
- ...

## 学习地图
- 1. 节点1名称
- 2. 节点2名称

## 节点讲义

### 1. 节点1名称
讲义正文...
```

**add-node**（markdown，首行是节点标题）：
```markdown
##### 2. 节点2名称
讲义正文...
```

**add-mistake**（markdown 列表）：
```markdown
- 误解1
- 误解2
```

## 落盘的两条不变量

**A — 教学与落盘原子**：本轮文本里输出了节点 N 的稳定讲义段（`##### N. {label}` 起头，非临时补讲），就必须紧接着 `add-node --idx N`（节点 1 由 `add-topic` 一并带入）。反向也成立——没有讲义文本就**绝不**调 add-node。CLI 现在用 state.yml 反向校验 done[N-1]=true，错调 add-node 会被 `NODE_PREREQUISITE_NOT_DONE` 拒。

**B — 探查每题落 state**：`in_progress` 首问 / 补问 / 用户答完后的轮，都必须 `write-state` 覆盖 `last_probe`（含 verdict、ledger、actions_used、current_question、question_count），并按 Probe 轮形态同步 done / current_node_idx / SM-2。这样用户中途关掉，下次进入立刻能 T-Resume。

A 与 B 满足就不需要"对账"或"补齐缺失节点"——所有写入都在事件发生当轮完成。

## 本轮结构（强制顺序）

1. 教学 / 反馈 / 探查问题等所有用户可见文本。
2. （仅 P4 终态）单独 Bash 调 `compute-sm2`，读取 stdout JSON 的 SM-2 字段。
3. 单独 Bash 调 `write-state`（本轮触发不变量 A 或 B 即必写）。
4. 视事件再单独 Bash 调 `add-topic` / `add-node` / `add-mistake` 之一。
5. **结束本轮，输出零字符**。每轮最多 3 次 Bash（P4 才用满 3 次，常规至多 2 次）；任一次失败就停止后续落盘，下一轮开头透传错误。

**Bash 后零文本是硬约束**：`write-state` / `add-*` 调用之后任何用户可见字符（包括"已保存"、"通过了"、补充说明、表情、空行后的总结）都视为违规。第 1 步发出的文本就是用户本轮看到的全部内容；落盘是无声完成的。唯一例外：`暂停保存` 分支允许在最后一条 Bash 之后回一行 `✓ 已保存进度` 作为信号，因为这一轮没有教学文本可承载该信号。

## 触发条件速查

| 本轮发生 | 必走 | 写入 |
|---|---|---|
| 创建 topic（Step 0 后首轮） | A + B 不触发，但 topic 骨架本身要落盘 | `write-state`（追加 topics、设 current_topic、map、`current_node_idx=1`）→ `add-topic --id <id>`（节点 1 讲义随骨架进入） |
| 教完节点正文输出"节点出口提示"结束（用户**未说**"检查一下"） | 都不触发 | **零 Bash**——`current_node_idx` / `done` / study.md 都不动 |
| 输出节点 N（N≥2）教学正文（**仅由 P1 触发**） | A | `write-state` → `add-node --idx N`（CLI 校验 done[N-1]=true） |
| 探查任意一轮（首问 T-Open / 补问 T-Step / 用户答完进入终态 T-Close） | B | P4 终态额外先调 `compute-sm2`；所有轮 `write-state` 覆盖 `last_probe`（含 verdict、ledger、actions_used、current_question、question_count）；终态轮再按 P1-P5 同步 done/idx/SM-2 |
| 切 topic / 暂停保存 | 仅 B 类的 state 维护 | `write-state`，不动 study.md |

## study.md 内容约束

`study.md` 只追加稳定教案：主题、学习目标、学习地图、节点讲义、节点错题。不要写 `## 当前学习`、`#### 复习建议`、topic 级 `易错点 / 待补强`；学习地图不带 `[x]` / `[ ]`；节点讲义不混入用户复述或纠错；错题只传本轮新增误解，LLM 先按字符串去重；stdin 不写 `<!-- topic:` / `<!-- node:` / `<!-- mistakes:`，锚由 CLI 维护。

## SOURCE-FILES LAW

`source-files/` 由插件在首次 Read / writer 调用时自动创建，由 `stubborn-coach:source-ingest` subagent 内部用 `extract-source` 维护落盘（PDF / DOCX / PPTX / 图像 / PDF URL 一律走它，docling 后端）。**主流程禁止任何对 `source-files/` 的写入或目录操作**——具体包括：

- ❌ 不要 `Write` / `Edit` 任何 `source-files/` 下的文件
- ❌ 不要用 Bash 调 `mkdir` / `New-Item` / `md` 建目录（`source-files/` 已存在；即使不存在，`extract-source` 也会自动建）
- ❌ 不要把用户原 PDF / DOCX 复制 / 移动到 `source-files/`（`extract-source` heredoc 接受任意绝对路径或 URL，原文件留在原地）
- ❌ 不要直接 Read 用户 PDF / DOCX / PPTX 字节（一律走 `stubborn-coach:source-ingest`；subagent 内部的 `extract-source` 会落 `.md`，主流程之后只 Read `.md`）
- ❌ **主流程不得自行调 `extract-source`**——这条 hidden CLI 是 subagent 私有工具，主流程合法的 Bash 只有四条写入命令（`write-state` / `add-topic` / `add-node` / `add-mistake`）和 `compute-sm2`。初始化自动完成，主流程不要调用 `stubborn-coach init`。即使用户给的文件名带空格 / 方括号 / 中文，也由 subagent 通过 heredoc 喂路径处理，主流程不要"代劳"或"重命名兜底"。

主流程拿到 subagent 返回的 `source_summary` 就直接进入教学循环。`citations` 里 `source_ref` 直接引用用户原始路径或 `source-files/<name>.md` 即可，不需要复制文件。

**Subagent 失败兜底**：调 `stubborn-coach:source-ingest` 后若没拿到结构化 `source_summary`（任意原因：tool 报错、subagent 提前 Done、返回非 YAML 文本等），主流程**直接停下，向用户报告"长源接入失败 + 失败摘要"**，让用户决定重试 / 换源 / 跳过。**绝不**自己 Read 二进制源、绝不自己调 `extract-source`、绝不基于碎片信息硬讲——这是把上下文污染挡在 subagent 边界外的唯一办法。
