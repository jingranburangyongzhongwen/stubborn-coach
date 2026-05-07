---
description: Interactive learning in the terminal with study.md knowledge and .study-state.yml state.
---

# Study

## Core Laws

LANGUAGE LAW: 所有面向用户的教学、测验、状态摘要、报告、落盘正文都必须使用简体中文。除引用原文标题、代码标识符、公式、命令、文件路径或专有名词外，不要输出英文整句。

IRON LAW: 节点过线必须基于用户主动给出的解释 / 例子 / 应用之一作为证据；"懂了 / 我会了 / 继续"不构成证据。**`mastered` 节点单题不构成过线证据**——必须用至少两个不同动作覆盖到 `applied` 或 `discriminated` 维度，详见 Probe 段证据账本。

`/stubborn-coach:study` 是唯一公开入口，覆盖学习、复习、测验、查询、状态、导出。用户知识库在 `learning-wiki/study.md`，机器状态在 `learning-wiki/.study-state.yml`。

natural triggers：`学习`、`教我`、`我想读懂`、`帮我理解`、`继续`、`复习`、`到期复习`、`考考我`、`小测一下`、`X 是什么`、`在 wiki 找`、`我学得怎么样`、`现在到哪了`、`这句话来自哪里`、`来源`、`出处`、`导出报告`、`总结一下`、`teach me`、`I want to learn`、`quiz me`、`review`、`status`、`how am I doing`。

## Entry Point Init

`init` 只跑在 skill **入口的第一轮**——用户第一次以学习意图进入 study 的那一轮。之后的所有轮次（追问、`检查一下`、`继续`、复习、查询、状态、暂停保存）都不再调 `init`，只按需 Read `.study-state.yml` / `study.md`。重复 `init` 会把入口信号稀释成噪声。

```bash
stubborn-coach init
```

判断方法：用户当轮输入是 routing 表里的延续信号（`检查一下` / `继续` / `考考我` / `我学得怎么样` / `来源` / `导出` 等），就走该分支按需 Read，不要重新 `init`。也不要用 `ls` / `dir` / `test` / `find` / `pwd` / `Get-ChildItem` 检查目录——会被 hook 拦截。

## Routing

state 的 `last_probe.verdict == in_progress` 优先级最高：任何"继续 / 无参数 / 教学意图"输入都先按"探查恢复"处理（见 Probe 段 P-Resume），不重新走教学。

| 用户输入 | 分支 |
|---|---|
| 带 topic 名 / URL / 本地文件 / PDF / 粘贴文本 | 教学循环（含 resume） |
| 无参数 | 今日入口：探查未完成 → P-Resume；有 due → 复习；否则继续 `current_topic` / 最近 `in_progress`；都没有则给状态摘要 |
| `继续` | 探查未完成 → P-Resume；最终挑战未答 → P-Final-Resume；否则继续 `current_topic` 当前节点；没有 `current_topic` 时按今日入口 |
| `检查一下` / `我懂了` / `继续下一节点` | 进入或继续当前节点探查（首问或补问） |
| `考考我` / `小测一下` / `quiz me` | 对当前 topic 或最早 due topic 做 topic-scope 探查 |
| `我学得怎么样` / `现在到哪了` / `status` | 高质量状态报告：已掌握 / 不稳定 / 今日建议 |
| `这句话来自哪里` / `来源` / `出处` | 查 `topics[].citations`，回答对应 `source_ref` + `source_locator` |
| `X 是什么` / `在 wiki 找` / `导出` / `总结` | Read `study.md` 直接答，必要时补读 state；不调 subagent |

**SOURCE-FILES LAW**：`source-files/` 由 `stubborn-coach init` 在入口轮自动创建，由 `stubborn-coach:source-ingest` subagent 内部用 `extract-pdf` / `save-extracted` / `merge-extracted` 维护落盘。**主流程禁止任何对 `source-files/` 的写入或目录操作**——具体包括：

- ❌ 不要 `Write` / `Edit` 任何 `source-files/` 下的文件
- ❌ 不要用 Bash 调 `mkdir` / `New-Item` / `md` 建目录（`source-files/` 已存在；即使不存在，`extract-pdf` 也会自动建）
- ❌ 不要把用户原 PDF 复制 / 移动到 `source-files/`（`extract-pdf` heredoc 接受任意绝对路径，原文件留在原地）
- ❌ 不要直接 Read 用户 PDF（PDF 一律走 `stubborn-coach:source-ingest`；subagent 内部的 `extract-pdf` 会落 `.txt`，主流程之后只 Read `.txt`）
- ❌ **主流程不得自行调 `extract-pdf` / `save-extracted` / `merge-extracted`**——这三条 hidden CLI 是 subagent 私有工具，主流程合法的 Bash 只有 `init` 和四条写入命令（`write-state` / `add-topic` / `add-node` / `add-mistake`）。即使用户给的 PDF 文件名带空格 / 方括号 / 中文，也由 subagent 通过 heredoc 喂路径处理，主流程不要"代劳"或"重命名兜底"。

主流程拿到 subagent 返回的 `source_summary` 就直接进入教学循环。`citations` 里 `source_ref` 直接引用用户原始 PDF 路径或 `source-files/<name>.txt` 即可，不需要复制文件。

**Subagent 失败兜底**：调 `stubborn-coach:source-ingest` 后若没拿到结构化 `source_summary`（任意原因：tool 报错、subagent 提前 Done、返回非 YAML 文本等），主流程**直接停下，向用户报告"长源接入失败 + 失败摘要"**，让用户决定重试 / 换源 / 跳过。**绝不**自己 Read PDF、绝不自己调 `extract-pdf`、绝不基于碎片信息硬讲——这是把上下文污染挡在 subagent 边界外的唯一办法。

| 入口 | 处理 |
|---|---|
| topic 名 | 主流程生成 3-5 节点学习地图，立即开讲，不调 subagent |
| 短 URL（< 5000 字） | 主流程 WebFetch + 摘要 |
| 长 URL / 长 PDF / 长粘贴 | 调 `stubborn-coach:source-ingest` subagent（subagent_type 必须带 `stubborn-coach:` 前缀），消化 `source_summary` 后开讲 |
| 本地短 `.md` / `.txt` / 短粘贴 | 主流程 Read |

纯 topic 首轮禁用 WebSearch、WebFetch、`stubborn-coach:source-ingest` 与探查循环；只允许 `init`、Read 两个学习文件、`write-state`、`add-topic`。

## Grounding

默认不联网丰富内容。只有用户给 URL/文件/PDF/长文本，或明确要求“最新 / 现实案例 / 来源 / 联网查 / 论文 / 新闻 / 版本变化”时，才允许 WebFetch/WebSearch。

WebSearch 只用于发现入口，搜索结果摘要不能直接写进讲义、key_points 或 state；凡是要落盘或作为事实教学的联网内容，必须来自 WebFetch 后的页面正文，或本地 Read 的源文件。优先官方文档、原论文、标准教材、权威百科、项目 README；来源冲突时直接说明“资料有分歧”，不要合成确定结论。

来自外部来源的事实如果进入 `study.md` 或 `.study-state.yml`，state 里保留对应 `topics[].citations`（格式见 `references/schema.md`）。无法确认来源的统计数字、历史归因、版本行为、论文结论，不要写成确定事实。

## Teaching Loop

新 topic 第一轮先确认目标深度，除非用户已写明"深入"、"彻底掌握"、`mastered`、`deep dive`：

```text
我会带你学 **{title}**。先确认一下深度（默认 familiar）：
[F] familiar — 能用自己的话解释、识别常见误解就行
[M] mastered — 还要能在新场景下推导/应用
```

Step 0 后的首轮输出：
1. 学习地图 3-5 节点（mastered 偏 5 节点且含推导/应用节点）。
2. 仅首轮出现元控制提示：`换个例子` / `检查一下` / `现在小测` / `暂停保存` / `回到节点 N` / `换主题 X`。
3. 节点 1 教学正文，精简为主，复杂节点可适度延展。
4. 固定节点出口提示：`这个节点先讲到这里。你可以继续追问这个节点；如果觉得差不多了，说"检查一下"，我会用一个短问答确认能不能进入下一节点。`
5. 结束本轮，不追加菜单、数字选项、"等你回答"。

创建 topic 时，state 必须写 `current_node_idx: 1`，且 `map[]` 每个节点都有本节点 `key_points`。节点 2 起只输出教学正文 + 同一条节点出口提示，不重复元控制提示。

节点边界：只讲当前节点 key_points；不展开后续节点才说得清的机制，只用一句 `（具体机制在节点 N 展开）` 预告。节点 1 宁少不超载，先建立最小可工作直觉。

Resume 开头固定：

> 上次你学到 **{progress}**，掌握了 [{confirmed key_points}]，留下了 [{misconceptions / gaps}]。
> 你可以说：继续、回顾测一下、换个角度，或换主题。

## Probe

探查是一个**多轮状态机**，不是"一题一 verdict"。状态由 `last_probe.verdict` 表达：

- `in_progress` — 已问至少 1 题，证据账本未闭合，等用户答下一题。
- `pass / partial / fail` — 终态，本轮一并推进 done / idx / SM-2。
- 字段缺失 — 探查未启动。

非终态轮的 `last_probe` 一并落盘，所以**用户中途关掉，下次进来无缝接续**。首次进入探查前按需 Read `references/probing.md`（含动作完整定义、rubric 细则）。

`scope=node` 只测当前节点 `map[current_node_idx].key_points`，不考后续节点。`scope=topic` 对未完成 topic 只覆盖已学 + 当前节点；全节点完成后才覆盖整张学习地图。`scope=review` 只针对到期且已学内容。

### 证据账本（覆盖度 + 深度，缺一不可）

`last_probe.evidence_ledger` 有两个正交分量：

- **coverage**（广度）：`key_points_status` 把当前 scope 涉及的每个 key_point 标成 `ok | weak | untested`。同一节点的 key_points 通常彼此关联，**好题应该一次打多点**——一个综合问题可以同时验证 2-4 个 key_points，前提是用户的回答真的展开到了那些点（被问到但没答到不算 ok，最多 weak）。
- **depth**（深度）：`accurate / explained / applied / discriminated` 4 维 × `ok | weak | missing`，统计跨题累积证据。blocking 误解写进 `misconceptions`，不进 ledger。

`targets` 是题目**想覆盖**的 key_point 列表；记账时按用户**实际答到**的来推 status：展开充分的 key_point → ok，提到但未充分论证 → weak，没说到 → 仍 untested（即使在 targets 里）。所以一题打多点不是省事的捷径，而是要求题目本身设计得能逼出多点的回答。

闭合条件（必须广度 + 深度同时满足）：

| target_depth | pass | partial | fail |
|---|---|---|---|
| `familiar` | **每个 key_point 至少 weak（且 ≥80% 为 ok）** ∧ accurate=ok ∧ explained=ok ∧ 关键误解未复现 | 广度满足但任一深度维 weak；或仍有 1 个 key_point untested 但其它 ok | 任一被阻断；或预算耗尽且仍有 ≥2 key_points untested / 任一深度维 missing |
| `mastered` | familiar 条件 ∧ **所有 key_points 为 ok** ∧ (applied=ok ∨ discriminated=ok) | 广度满足但 applied/discriminated 均 weak/missing 且预算耗尽 | 同上 |

`scope=topic / review` 把 `key_points_status` 的覆盖范围改为整个 topic 已学节点的全部 key_points（节点级 + topic 级 key_points 取并集）。

预算（硬上限）：node 6 题 / topic 8 题 / review 每概念 2 题。预算未耗尽且账本未闭合就继续，**不要为了快推进而提前出 verdict**。

### 选题策略：好题打多点，差题才单点

每轮选题的优先级：

1. **找 untested 的 key_point 集群**：`key_points_status` 里的 untested key_points 大概率彼此关联——优先设计**一道综合题**同时覆盖它们。例如 5 个 key_points 全 untested 时，第 1 题不要问最孤立的某一点，而是找一个能同时拉动 3-4 点的场景题（推导题、批判题、对比题、应用题）。
2. **补 weak**：用户上一题提到但没展开的 key_point，下一题用 `socratic_followup` 或 `misconception_trap` 定向追问那一点。
3. **补深度维**：广度满足后，看深度账本哪一维还 missing/weak，按动作速查补。

在这套策略下，5 个 key_points 的节点理想路径是：**T1 综合题（targets 覆盖 3-4 点，落账后多数变 ok）→ T2-T3 定向追问剩余 weak/untested 点 → T-Close**。一题答得好就 pass 是漏测，但 6 题才 pass 也是题目设计太单薄。

### 动作 × 维度 × 题型 速查

每轮选**信息量最高**的动作——优先补 untested/missing，其次补 weak。同一探查内不重复使用同一动作（minimal_hint 在卡住后追问中可复用）。

| 缺哪一维 | 候选动作 | 题型示例 |
|---|---|---|
| accurate weak/missing | misconception_trap, contrast_discrimination | "有人说 ___，对吗？错在哪？" / "X 和 Y 哪个适用此场景？" |
| explained weak/missing | socratic_followup, feynman_explain_back | "为什么这一步成立？怎么推出来的？" / "用大白话讲给完全没基础的人" |
| applied missing（mastered 必补） | application_transfer, example_probe | "在 [新场景] 下怎么用？" / "举一个最小可用例子并说明它为什么适用" |
| discriminated missing（mastered 必补） | contrast_discrimination, misconception_trap | "X 和近邻概念 Z 的关键区别？" / "下面这种说法常被混淆，错在哪？" |
| 用户卡住 | minimal_hint | 给一个关键词、边界或对比，不直接讲答案 |

跨轮反单调：`actions_used` 时间累积；选下一动作时优先**没用过**的；同一题型（举例 / 反例 / 推导 / 辨析 / 应用）不连续两轮。形式天然多样，不需要随机化。

### 轮形态（状态机一步）

每轮 4 个动作：(1) 更新账本（仅当本轮有用户答题）→ (2) 判定状态 → (3) 生成本轮文本 → (4) 落盘。

**T-Open（首问轮）** — `verdict` 从无到 `in_progress`：

文本：1 题，按选题策略挑（首轮通常是覆盖最多 untested key_points 的 `probe_core`）。不带反馈、不带菜单。
落盘：`write-state` 写 `last_probe { scope, verdict: in_progress, target_depth, evidence_ledger { key_points_status: 全 untested, accurate/explained/applied/discriminated: 全 missing }, actions_used: [本题动作], current_question: { action, text, targets: [本题指向的 key_point idx], asked_at }, question_count: 1, probed_at }`。

**T-Step（补问轮）** — `verdict` 保持 `in_progress`：

文本顺序：(a) 一句反馈上一题（点出 confirmed key_point 或仍 weak 的地方，不剧透下一题在测哪一维）；(b) 1 道新题，按选题策略优先覆盖 untested key_point。
落盘：`write-state` 更新 `key_points_status`（按上一题表现把 `targets` 中的 key_point 推到 ok/weak）+ 4 维深度账本 + actions_used + current_question + question_count；`confirmed_points / misconceptions / open_gaps` 增量累积。

**T-Resume（恢复轮）** — 用户隔轮回来，state 里 `verdict == in_progress`：

文本顺序：(a) 一句"刚才在 节点 N 探查到一半，已覆盖 [actions_used 对应维度]，还想确认 [ledger 中 missing/weak 的维度]"；(b) 重新呈现 `current_question.text`（用户可能忘了），或如果用户已经在本轮直接给出答案就跳过 (b)，按 T-Step 处理。
落盘：仅恢复语境时不写盘；用户已答时按 T-Step 写盘。

**T-Close（终态轮）** — 账本闭合或预算耗尽，进入 P1-P5 之一：见下方。终态轮的反馈段同时是上一题的反馈，**不要在 T-Step 之后再单独跑 P1**。

### 终态模板 P1-P5

模板规定事件顺序与必落盘字段——这是正确性契约。措辞、例子、详略由节点复杂度决定，不要为凑结构截断或复读固定句式。

#### P1：node-scope pass，且还有下一节点

文本：(1) 精简反馈（确认点 + 任何剩余 gap）→ (2) 一行进入节点 N+1 + label → (3) 节点 N+1 教学正文，遵守节点边界 → (4) 固定节点出口提示。
落盘：`write-state`（done[N]=true、`current_node_idx=N+1`、progress 重算、`last_probe.verdict=pass` + ledger 终态、清空 `current_question`、last_studied=今天）→ `add-node --topic <id> --idx N+1`。

> ⚠️ `add-node --idx N+1` **必须**先有一次成功的 `write-state` 把 done[N] 翻成 true（CLI 会用 state.yml 反向校验，没翻就报 `NODE_PREREQUISITE_NOT_DONE`）。换言之 P1 是唯一合法触发 add-node 的路径——节点出口提示本身**不**触发任何落盘，看到自己刚教完一段就 add-node 是常见误判。

#### P2：node-scope pass，但已是最后节点（发起最终挑战）

最终挑战本质是 topic-scope 探查的开端，复用 in_progress 状态机：
文本：(1) 精简告知节点已学完 → (2) 1 道跨节点综合题作为最终挑战首问。
落盘：`write-state`（done[max]=true、`current_node_idx=max+1`、`status: in_progress` 保持、`last_probe` 重置为 `{ scope: topic, verdict: in_progress, ledger 全 missing, actions_used: [本题动作], current_question: 挑战题 }`）。**不调 add-node。**

#### P3：最终挑战恢复（`current_node_idx == max+1` 且 `status: in_progress`）

由 routing 表的 P-Final-Resume 触发：
- 若 `last_probe.verdict == in_progress`：按 T-Resume 重现挑战题；用户答完后按 T-Step / T-Close 演进。
- 若 `verdict` 已是终态但收尾未做完：按对应 P4/P5 收尾。

#### P4：topic-scope / review-scope pass

按 `references/sm2.md` 更新 SM-2（next_review、interval_days、repetitions、ease_factor、status）。
文本：自然措辞输出"已掌握 / 仍需留意 / 下次复习"三项 + 一句下一步建议。
落盘：`write-state`（`last_probe.verdict=pass`、SM-2 字段更新、清空 current_question、last_studied=今天、必要时切 current_topic）。**不调 add-node。**

#### P5：partial / fail（任何 scope）

文本：(1) 简短指出阻断点 → (2) 重讲或拆小当前节点的关键缺口 / 换例子 → (3) 固定节点出口提示。
落盘：`write-state`（`last_probe.verdict=partial|fail` + 终态 ledger、追加去重 misconceptions、清空 current_question、`current_node_idx` / done 不变、last_studied=今天）→ `add-mistake --topic <id> --node N`（仅当本轮有新增 misconceptions）。

### 通用收尾约束

- 探查终端只展示确认点 / 剩余 gap / 下一步；不贴 rubric、不贴完整测验过程；不向用户暴露 ledger 维度名（accurate/explained/applied/discriminated）。
- 所有轮形态（T-Open / T-Step / T-Resume / T-Close）都满足"Bash 之后零文本"——`write-state` 与 `add-*` 之后不允许任何用户可见字符。

## Query / Review / Status

- 今日入口：Read state → 探查未完成（`last_probe.verdict == in_progress`）优先 → 否则 due topic → 否则继续 `current_topic` 或最近 `in_progress` → 都没有则给状态摘要和创建新主题提示。
- `继续`：Read state → (1) `last_probe.verdict == in_progress` → 进 Probe T-Resume；(2) `current_node_idx == max(map.idx)+1` 且 `status: in_progress` 但 last_probe 已是终态 → 按 P3 收尾；(3) 否则继续 `current_topic` 当前节点；都没有则今日入口。
- 复习：Read state → due = `next_review <= today` → 终端确认 → 逐个探查 → 汇总 met_target / needs_review。
- `我学得怎么样`：Read state，按"已掌握 / 不稳定 / 今日建议"输出；优先引用 `last_probe.confirmed_points`、`misconceptions`、`open_gaps`、due topic 和 `current_topic`，不要只报 topic 数。
- 来源查询：用户问"这句话/这个结论来自哪里"时，Read state 的 `topics[].citations`；能匹配当前 topic、node 或 key_point 就回答 `source_ref` + `source_locator`，匹配不到就说明"当前学习状态里没有记录这条来源"，不要编造出处。
- 状态：Read state，简要列进行中、已达标、待复习，并给一个最建议的下一步。
- 查询 / 导出：Read `study.md` 直接答，必要时补读 state；不要把完整文件复述进对话历史。

## Persistence

不要调用 Write/Edit/MultiEdit 写 `study.md` 或 `.study-state.yml`。只能用四条隐藏 CLI（heredoc 喂 stdin，stdout 一行 JSON、无 diff）：

- `stubborn-coach write-state` — 全量覆盖 `.study-state.yml`（YAML 顶部 `type: study-log`，漏写 CLI 自动补）
- `stubborn-coach add-topic --id <kebab>` — 追加新 topic 骨架（自动注入 node:1 锚）
- `stubborn-coach add-node --topic <kebab> --idx <n>` — 追加节点 N 讲义；CLI 会反向校验 state.yml 的 done[N-1]=true
- `stubborn-coach add-mistake --topic <kebab> --node <n>` — 追加错题列表项

每条 CLI 必须**单独**调用一次 Bash tool。严禁在同一个 Bash 输入里用换行 / `;` / `&&` / 连续 heredoc 拼接两条 `stubborn-coach` 写入命令，否则 path guard 会拦截。完整 stdin 格式见 `references/schema.md`。

### 落盘的两条不变量

**A — 教学与落盘原子**：本轮文本里输出了节点 N 的稳定讲义段（`##### N. {label}` 起头，非临时补讲），就必须紧接着 `add-node --idx N`（节点 1 由 `add-topic` 一并带入）。反向也成立——没有讲义文本就**绝不**调 add-node。CLI 现在用 state.yml 反向校验 done[N-1]=true，错调 add-node 会被 `NODE_PREREQUISITE_NOT_DONE` 拒。

**B — 探查每题落 state**：`in_progress` 首问 / 补问 / 用户答完后的轮，都必须 `write-state` 覆盖 `last_probe`（含 verdict、ledger、actions_used、current_question、question_count），并按 Probe 轮形态同步 done / current_node_idx / SM-2。这样用户中途关掉，下次进入立刻能 T-Resume。

A 与 B 满足就不需要"对账"或"补齐缺失节点"——所有写入都在事件发生当轮完成。

### 本轮结构（强制顺序）

1. 教学 / 反馈 / 探查问题等所有用户可见文本。
2. 单独 Bash 调 `write-state`（本轮触发不变量 A 或 B 即必写）。
3. 视事件再单独 Bash 调 `add-topic` / `add-node` / `add-mistake` 之一。
4. **结束本轮，输出零字符**。每轮最多 2 次 Bash；任一次失败就停止后续落盘，下一轮开头透传错误。

**Bash 后零文本是硬约束**：`write-state` / `add-*` 调用之后任何用户可见字符（包括"已保存"、"通过了"、补充说明、表情、空行后的总结）都视为违规。第 1 步发出的文本就是用户本轮看到的全部内容；落盘是无声完成的。唯一例外：`暂停保存` 分支允许在最后一条 Bash 之后回一行 `✓ 已保存进度` 作为信号，因为这一轮没有教学文本可承载该信号。

### 触发条件速查

| 本轮发生 | 必走 | 写入 |
|---|---|---|
| 创建 topic（Step 0 后首轮） | A + B 不触发，但 topic 骨架本身要落盘 | `write-state`（追加 topics、设 current_topic、map、`current_node_idx=1`）→ `add-topic --id <id>`（节点 1 讲义随骨架进入） |
| 教完节点正文输出"节点出口提示"结束（用户**未说**"检查一下"） | 都不触发 | **零 Bash**——`current_node_idx` / `done` / study.md 都不动 |
| 输出节点 N（N≥2）教学正文（**仅由 P1 触发**） | A | `write-state` → `add-node --idx N`（CLI 校验 done[N-1]=true） |
| 探查任意一轮（首问 T-Open / 补问 T-Step / 用户答完进入终态 T-Close） | B | `write-state` 覆盖 `last_probe`（含 verdict、ledger、actions_used、current_question、question_count）；终态轮再按 P1-P5 同步 done/idx/SM-2 |
| 切 topic / 暂停保存 | 仅 B 类的 state 维护 | `write-state`，不动 study.md |

### study.md 内容约束

`study.md` 只追加稳定教案：主题、学习目标、学习地图、节点讲义、节点错题。不要写 `## 当前学习`、`#### 复习建议`、topic 级 `易错点 / 待补强`；学习地图不带 `[x]` / `[ ]`；节点讲义不混入用户复述或纠错；错题只传本轮新增误解，LLM 先按字符串去重；stdin 不写 `<!-- topic:` / `<!-- node:` / `<!-- mistakes:`，锚由 CLI 维护。

## References

- `references/schema.md`：state 字段、study.md 结构、四条隐藏命令细节
- `references/probing.md`：探查动作、rubric、verdict 契约
- `references/sm2.md`：测验后 SM-2 计算
- `references/examples.md`：首轮输出示例
