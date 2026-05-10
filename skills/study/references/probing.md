# 探查循环协议

主流程在用户说"检查一下"、"现在小测"、"复习"时进入探查循环。探查不是额外教学，而是用最少轮次收集足够证据，决定继续、补讲或重讲。本文件定义完整的探查协议：作用域预算、证据账本、动作库、选题策略、轮形态（T-Open / T-Step / T-Resume / T-Close）、终态模板 P1-P5、rubric 与 last_probe schema。

首问不落盘：用户刚说"检查一下"时，只输出第一题，不调用 Bash、不写 `last_probe`。只有用户答题后，才根据证据写 `last_probe`（追问时写 `in_progress`，终态时写 `pass|partial|fail`）。没有用户答案就没有学习证据，首问丢失时重新出题即可。

IRON LAW: 节点过线必须基于用户主动给出的解释 / 例子 / 应用之一作为证据；"懂了 / 我会了 / 继续"不构成证据。`mastered` 节点单题不足以构成过线证据——必须 ≥2 次不同动作才有机会同时覆盖到 applied 或 discriminated 维度。

## 探查初始化（每轮探查的前置步骤）

进入探查循环时，在出第一题之前，先完成以下初始化：

1. 从 state 读取当前节点的 `map[current_node_idx].key_points`，作为本轮探查的 key_point 列表。
2. 初始化 `evidence_ledger.key_points_status`：每个 key_point 标为 `untested`。
3. 初始化深度四维：`accurate / explained / applied / discriminated` 全部 `missing`。
4. 按闭合条件确定本轮 `target_depth`（镜像 topic 的 `target_depth`）。
5. 按选题策略设计第一题（优先覆盖最多 untested key_points 的综合题）。

初始化完成后才出第一题。T-Open 的初始化只发生在本轮上下文中，不写入 `.study-state.yml`。

## 作用域与预算

| scope | 目的 | 预算（硬上限） |
|---|---|---|
| `node` | 判断当前节点能否进入下一节点 | 6 题 |
| `topic` | 主动小测 / 最终挑战，校准路线与整体掌握 | 8 题 |
| `review` | 到期复习，检查保持与遗忘 | 每个到期概念 2 题 |

`scope=node` 只测当前节点 `map[current_node_idx].key_points`，不考后续节点。`scope=topic` 对未完成 topic 只覆盖已学 + 当前节点；全节点完成后才覆盖整张学习地图。`scope=review` 只针对到期且已学内容。

证据账本闭合就停（见下方闭合条件——必须广度 + 深度同时满足）。**好题打多点**：同一节点的 key_points 通常彼此关联，一道综合题（推导 / 批判 / 对比 / 应用）可以同时把 3-4 个 key_points 推到 ok，所以理想路径是 1 道综合 + 1-2 道定向追问。预算只是上限，不是题数下界——题目设计得拉得动多点，3 题就够；设计得单薄，6 题也是浪费。`node` 只测当前节点 key_points；`topic` / `review` 综合已学节点。

## 证据账本（覆盖度 + 深度，缺一不可）

`last_probe.evidence_ledger` 有两个正交分量：

- **coverage**（广度）：`key_points_status` 把当前 scope 涉及的每个 key_point 标成 `ok | weak | untested`。被问到但用户没答到的 key_point 不算 ok，最多 weak——一题打多点要求题目设计得能逼出多点的回答，不是省事的捷径。
- **depth**（深度）：`accurate / explained / applied / discriminated` 4 维 × `ok | weak | missing`，统计跨题累积证据。blocking 误解写进 `misconceptions`，不进 ledger。

`targets` 是题目**想覆盖**的 key_point 列表；记账时按用户**实际答到**的来推 status：展开充分的 key_point → ok，提到但未充分论证 → weak，没说到 → 仍 untested（即使在 targets 里）。所以一题打多点不是省事的捷径，而是要求题目本身设计得能逼出多点的回答。

### 闭合条件（必须广度 + 深度同时满足）

| target_depth | pass | partial | fail |
|---|---|---|---|
| `familiar` | **每个 key_point 至少 weak（且 ≥80% 为 ok）** ∧ accurate=ok ∧ explained=ok ∧ 关键误解未复现 | 广度满足但任一深度维 weak；或仍有 1 个 key_point untested 但其它 ok | 任一被阻断；或预算耗尽且仍有 ≥2 key_points untested / 任一深度维 missing |
| `mastered` | familiar 条件 ∧ **所有 key_points 为 ok** ∧ (applied=ok ∨ discriminated=ok) | 广度满足但 applied/discriminated 均 weak/missing 且预算耗尽 | 同上 |

`scope=topic / review` 把 `key_points_status` 的覆盖范围改为整个 topic 已学节点的全部 key_points（节点级 + topic 级 key_points 取并集）。

## 探查动作库

每轮选信息量最高的动作；同一探查内不重复使用同一动作（`minimal_hint` 跟在卡住后的追问之后除外）。

| 动作 | 何时使用 | 做法 | 主补维度 |
|---|---|---|---|
| `probe_core` | 首问或证据不足时 | 问一个能同时覆盖多个 key_points 的核心问题 | accurate + explained |
| `socratic_followup` | 方向对但解释链断裂 | 追问"为什么 / 怎么推出 / 这一步凭什么" | explained |
| `minimal_hint` | 用户卡住但接近 | 只给一个关键词、边界或对比，不直接讲答案 | （辅助）|
| `feynman_explain_back` | 用户堆术语但不接地气 | 要求用简单话重讲给初学者听 | explained |
| `example_probe` | 需要确认是否真理解 | 让用户自己举例，或解释一个极小例子是否适用 | applied |
| `misconception_trap` | 疑似误解或历史误解复现 | 构造错误模型会预测 A 的场景，让用户解释为什么实际是 B | discriminated / accurate |
| `application_transfer` | 主干已稳，尤其 mastered | 换新场景，验证能否迁移应用 | applied |
| `contrast_discrimination` | 概念相近或容易混淆 | 要求区分两个相邻概念或反驳常见错误说法 | discriminated |
| `stop_with_result` | 证据足够、阻断误解明确或预算耗尽 | 停止问答，按终态模板 P1-P5 收尾 | — |

## 选题策略：好题打多点，差题才单点

每轮选题的优先级：

1. **找 untested 的 key_point 集群**：`key_points_status` 里的 untested key_points 大概率彼此关联——优先设计**一道综合题**同时覆盖它们。例如 5 个 key_points 全 untested 时，第 1 题不要问最孤立的某一点，而是找一个能同时拉动 3-4 点的场景题（推导题、批判题、对比题、应用题）。
2. **补 weak**：用户上一题提到但没展开的 key_point，下一题用 `socratic_followup` 或 `misconception_trap` 定向追问那一点。
3. **补深度维**：广度满足后，看深度账本哪一维还 missing/weak，按动作速查补。

在这套策略下，5 个 key_points 的节点理想路径是：**T1 综合题（targets 覆盖 3-4 点，落账后多数变 ok）→ T2-T3 定向追问剩余 weak/untested 点 → T-Close**。一题答得好就 pass 是漏测，但 6 题才 pass 也是题目设计太单薄。

### 证据 / 边界节点的探查

如果当前节点的 key_points 主要是实验设置、结果数字、baseline 对比、消融、鲁棒性、失败现象或适用边界，不要用“复述数字 / 复述结论”判通过。首问优先要求用户解释：这些结果支持了哪个主张、为什么算支持、还不能证明什么或在哪些条件下会失效。

对这类节点，`familiar` 通过至少需要用户主动说出一个“结果 → 主张”的连接，并说出一个边界 / 局限 / 不能证明的点。用户只记住成功率、SOTA 或“效果很好”，最多算 weak，不能 pass。

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

## 轮形态（状态机一步）

有用户答题的轮执行 4 个动作：(1) 更新账本 → (2) 判定状态 → (3) 生成本轮文本 → (4) 落盘。T-Open 首问轮没有用户答题，只输出问题并结束本轮。

**T-Open（首问轮）** — 用户刚触发探查，还没有答题证据：

文本：1 题，按选题策略挑（首轮通常是覆盖最多 untested key_points 的 `probe_core`）。不带反馈、不带菜单，不暴露"按某类节点规则设计题目"之类内部判断。
落盘：**零 Bash**。不要调用 `write-state`，不要写 `last_probe`，不要构造 `current_question`。如果用户在回答前中断，下次重新 T-Open 出题。

**T-Step（补问轮）** — 用户已回答上一题，但证据还不够，需要继续问：

文本顺序：(a) 一句反馈上一题（点出 confirmed key_point 或仍 weak 的地方，不剧透下一题在测哪一维）；(b) 1 道新题，按选题策略优先覆盖 untested key_point。
落盘：`write-state` 写完整 state，覆盖 `last_probe.verdict=in_progress`。其中 `key_points_status` 和 4 维深度账本基于用户刚刚的回答更新；`actions_used` 记录已用动作；`current_question` 写本轮新问的问题；`question_count` 从已回答题数 + 新问题计数累积；`confirmed_points / misconceptions / open_gaps` 增量累积。

**T-Resume（恢复轮）** — 用户隔轮回来，state 里 `verdict == in_progress`：

文本顺序：(a) 一句"刚才在 节点 N 探查到一半，已覆盖 [actions_used 对应维度]，还想确认 [ledger 中 missing/weak 的维度]"；(b) 重新呈现 `current_question.text`（用户可能忘了），或如果用户已经在本轮直接给出答案就跳过 (b)，按 T-Step 处理。
落盘：仅恢复语境时不写盘；用户已答时按 T-Step 写盘。若 state 没有 `last_probe.verdict == in_progress`，但用户像是在回答上一题，无法可靠归属；请提示用户说"检查一下"，重新出一题，不要猜测并落盘。

**T-Close（终态轮）** — 账本闭合或预算耗尽，进入 P1-P5 之一（见下方）。终态轮的反馈段同时是上一题的反馈，**不要在 T-Step 之后再单独跑 P1**。

## 终态模板 P1-P5

模板规定事件顺序与必落盘字段——这是正确性契约。措辞、例子、详略由节点复杂度决定，不要为凑结构截断或复读固定句式。

#### P1：node-scope pass，且还有下一节点

文本：(1) 精简反馈（确认点 + 任何剩余 gap）→ (2) 一行进入节点 N+1 + label → (3) 节点 N+1 教学正文，遵守节点边界 → (4) 固定节点出口提示。
落盘：`write-state`（done[N]=true、`current_node_idx=N+1`、progress 重算、`last_probe.verdict=pass` + ledger 终态、清空 `current_question`、last_studied=今天）→ `add-node --topic <id> --idx N+1`。

> ⚠️ `add-node --idx N+1` **必须**先有一次成功的 `write-state` 把 done[N] 翻成 true（CLI 会用 state.yml 反向校验，没翻就报 `NODE_PREREQUISITE_NOT_DONE`）。换言之 P1 是唯一合法触发 add-node 的路径——节点出口提示本身**不**触发任何落盘，看到自己刚教完一段就 add-node 是常见误判。

#### P2：node-scope pass，但已是最后节点（发起最终挑战）

最终挑战本质是 topic-scope 探查的开端，首问同样不落 `current_question`：
文本：(1) 精简告知节点已学完 → (2) 1 道跨节点综合题作为最终挑战首问。
落盘：`write-state`（done[max]=true、`current_node_idx=max+1`、`status: in_progress` 保持、`last_probe.current_question=null`，可保留刚通过的节点终态摘要或清空）。**不调 add-node。** 如果用户在回答最终挑战前中断，下次 P3 重新出一道最终挑战题。

#### P3：最终挑战恢复（`current_node_idx == max+1` 且 `status: in_progress`）

由 routing 表的 P-Final-Resume 触发：
- 若 `last_probe.verdict == in_progress`：按 T-Resume 重现挑战题；用户答完后按 T-Step / T-Close 演进。
- 若没有 `last_probe.verdict == in_progress`：按 topic-scope T-Open 重新出一道最终挑战题，首问不落盘。
- 若 `verdict` 已是终态但收尾未做完：按对应 P4/P5 收尾。

#### P4：topic-scope / review-scope pass

先调 `stubborn-coach compute-sm2 --quality <q> --ease <e> --interval <i> --reps <r> --today <d>`，从 JSON stdout 取 SM-2 结果（next_review、interval_days、repetitions、ease_factor、status）。
文本：自然措辞输出"已掌握 / 仍需留意 / 下次复习"三项 + 一句下一步建议。
落盘：`compute-sm2`（取结果）→ `write-state`（`last_probe.verdict=pass`、SM-2 字段更新、清空 current_question、last_studied=今天、必要时切 current_topic）。**不调 add-node。**

#### P5：partial / fail（任何 scope）

文本：(1) 简短指出阻断点 → (2) 重讲或拆小当前节点的关键缺口 / 换例子 → (3) 固定节点出口提示。
落盘：`write-state`（`last_probe.verdict=partial|fail` + 终态 ledger、追加去重 misconceptions、清空 current_question、`current_node_idx` / done 不变、last_studied=今天）→ `add-mistake --topic <id> --node N`（仅当本轮有新增 misconceptions）。

## 通用收尾约束

- 探查终端只展示确认点 / 剩余 gap / 下一步；不贴 rubric、不贴完整测验过程；不向用户暴露 ledger 维度名（accurate/explained/applied/discriminated）。
- 所有轮形态（T-Open / T-Step / T-Resume / T-Close）都满足"Bash 之后零文本"——`write-state` 与 `add-*` 之后不允许任何用户可见字符。

## Rubric

内部按 4 维评估（evidence_ledger 维度），不把完整矩阵贴给用户，只用它决定每维 `ok / weak / missing` 与终态 verdict。

| 维度 | ok 证据 | weak 证据 | missing |
|---|---|---|---|
| `accurate` | 事实、逻辑与 key_points 一致 | 术语对但关系错 | 未问到 |
| `explained` | 能讲出为什么 / 如何发生 | 背定义，没有因果链 | 未问到 |
| `applied` | 能在新场景下用对 | 换场景就失效 | 未问到 |
| `discriminated` | 能区分相近概念或反驳常见误解 | 被诱饵说法带偏 | 未问到 |

终态 verdict 由上方闭合条件表决定。`familiar` 至少要 accurate + explained 都 ok 且关键误解未复现；`mastered` 在此基础上还需 applied 或 discriminated 至少一项 ok。

## Verdict 与 quality

`verdict` 取值：

- `in_progress` — 用户已经答过至少一题，证据仍不足，且本轮已落盘保存下一题。
- `pass` — 达到当前 `target_depth` 门槛，关键误解未复现。
- `partial` — 主干接近，缺一个关键链条或依赖提示，或轻微误解仍需修补。
- `fail` — 出现阻断后续学习的核心误解，或多数关键点没有证据。

误解只在两条都满足时才算解决：
1. 用户能说出旧想法错在哪里。
2. 用户在一个新场景里不再触发同一错误模型。

`quality` 用于 SM-2，仅在 verdict 终态时写：

| quality | 条件 |
|---|---|
| 5 | pass，解释清楚，能迁移/辨析，无提示依赖 |
| 4 | pass，核心证据足够，但略有犹豫或表达不完整 |
| 3 | 勉强 pass，需要提示后才补齐 |
| 2 | partial，主干接近但仍有 gap |
| 1 | fail，但有少量正确片段 |
| 0 | fail，核心误解或几乎无有效证据 |

`node` 探查的 quality 不更新 SM-2，但仍写入便于状态报告。

## last_probe schema

```yaml
last_probe:
  scope: { type: node, node_idx: 1 }    # node | topic | review
  target_depth: familiar                 # 镜像 topic.target_depth，便于闭合判定
  verdict: in_progress                   # in_progress | pass | partial | fail
  quality: null                          # in_progress 时为 null，终态时按上表写
  question_count: 2
  evidence_ledger:
    key_points_status:                   # 广度：当前 scope 的每个 key_point 状态
      - { idx: 1, label: 静止物体也有 E=mc² 对应的能量, status: ok }
      - { idx: 2, label: c² 是单位换算系数, status: weak }
      - { idx: 3, label: ..., status: untested }
    accurate: ok                         # 深度 4 维 × { ok | weak | missing }
    explained: ok
    applied: missing
    discriminated: missing
  actions_used: [probe_core, socratic_followup]   # 时间累积，不去重
  current_question:                      # in_progress 时必写下一题；终态时清空（null）
    action: application_transfer
    text: 在 [新场景] 下要怎么用 X？
    targets: [3]                         # 本题指向的 key_point idx 列表
    asked_at: 2026-05-06
  confirmed_points:                      # 增量累积
    - ...
  misconceptions:                        # 增量累积；blocking 误解也写在这里
    - ...
  open_gaps:
    - ...
  evidence_summary: 用户能解释 X，但 Y 仍含糊。   # 终态轮必填，in_progress 可空
  stopped_early_reason: evidence_sufficient       # 终态轮必填：evidence_sufficient | blocking_misconception | budget_exhausted
  recommended_next_action: 进入节点 2，讲 ...     # 终态轮必填
  probed_at: 2026-05-06
```

`last_probe` 只在用户答题后的轮写入。T-Open 首问不写 `last_probe`；非终态追问轮写 `in_progress`，用户中途离开后可 T-Resume。长期误解仍写入 `topics[].misconceptions` 并追加去重。
