# 探查循环协议

主流程在用户说"检查一下"、"现在小测"、"复习"时进入探查循环。探查不是额外教学，而是用最少轮次收集足够证据，决定继续、补讲或重讲。SKILL.md 规定了入口、轮形态（T-Open / T-Step / T-Resume / T-Close）、动作-维度-题型速查表与终态模板 P1-P5；本文件补充作用域预算、动作库、rubric 与 last_probe schema 细节。

IRON LAW: 节点过线必须基于用户主动给出的解释 / 例子 / 应用之一作为证据；"懂了 / 我会了 / 继续"不构成证据。`mastered` 节点单题不足以构成过线证据——必须 ≥2 次不同动作才有机会同时覆盖到 applied 或 discriminated 维度。

## 作用域与预算

| scope | 目的 | 预算（硬上限） |
|---|---|---|
| `node` | 判断当前节点能否进入下一节点 | 6 题 |
| `topic` | 主动小测 / 最终挑战，校准路线与整体掌握 | 8 题 |
| `review` | 到期复习，检查保持与遗忘 | 每个到期概念 2 题 |

证据账本闭合就停（见 SKILL.md 闭合条件——必须广度 + 深度同时满足）。**好题打多点**：同一节点的 key_points 通常彼此关联，一道综合题（推导 / 批判 / 对比 / 应用）可以同时把 3-4 个 key_points 推到 ok，所以理想路径是 1 道综合 + 1-2 道定向追问。预算只是上限，不是题数下界——题目设计得拉得动多点，3 题就够；设计得单薄，6 题也是浪费。`node` 只测当前节点 key_points；`topic` / `review` 综合已学节点。

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
| `stop_with_result` | 证据足够、阻断误解明确或预算耗尽 | 停止问答，按 SKILL.md 终态模板 P1-P5 收尾 | — |

## Rubric

内部按 4 维评估（即 SKILL.md 的 evidence_ledger 维度），不把完整矩阵贴给用户，只用它决定每维 `ok / weak / missing` 与终态 verdict。

| 维度 | ok 证据 | weak 证据 | missing |
|---|---|---|---|
| `accurate` | 事实、逻辑与 key_points 一致 | 术语对但关系错 | 未问到 |
| `explained` | 能讲出为什么 / 如何发生 | 背定义，没有因果链 | 未问到 |
| `applied` | 能在新场景下用对 | 换场景就失效 | 未问到 |
| `discriminated` | 能区分相近概念或反驳常见误解 | 被诱饵说法带偏 | 未问到 |

终态 verdict 由 SKILL.md 的闭合条件表决定。`familiar` 至少要 accurate + explained 都 ok 且关键误解未复现；`mastered` 在此基础上还需 applied 或 discriminated 至少一项 ok。

## Verdict 与 quality

`verdict` 取值：

- `in_progress` — 探查未结束，当轮已落盘。
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
  current_question:                      # in_progress 时必写；终态时清空（null）
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

`last_probe` 非终态时也每轮覆盖；用户中途离开，下次 T-Resume 直接读它即可恢复语境。长期误解仍写入 `topics[].misconceptions` 并追加去重。
