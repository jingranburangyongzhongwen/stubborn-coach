---
description: Interactive learning in the terminal with study.md knowledge and .study-state.yml state.
---

# Study

## Core Laws

LANGUAGE LAW: 所有面向用户的教学、测验、状态摘要、报告、落盘正文都必须使用简体中文。除引用原文标题、代码标识符、公式、命令、文件路径或专有名词外，不要输出英文整句。

IRON LAW: 节点过线必须基于用户主动给出的解释 / 例子 / 应用之一作为证据；"懂了 / 我会了 / 继续"不构成证据。`mastered` 节点单题不构成过线证据——必须用至少两个不同动作覆盖到 `applied` 或 `discriminated` 维度，详见 `references/probing.md` 证据账本。

`/stubborn-coach:study` 是唯一公开入口，覆盖学习、复习、测验、查询、状态、导出。用户知识库在 `learning-wiki/study.md`，机器状态在 `learning-wiki/.study-state.yml`。

natural triggers：`学习`、`教我`、`我想读懂`、`帮我理解`、`继续`、`复习`、`到期复习`、`考考我`、`小测一下`、`X 是什么`、`在 wiki 找`、`我学得怎么样`、`现在到哪了`、`这句话来自哪里`、`来源`、`出处`、`导出报告`、`总结一下`、`teach me`、`I want to learn`、`quiz me`、`review`、`status`、`how am I doing`。

## Routing

state 的 `last_probe.verdict == in_progress` 优先级最高：任何"继续 / 无参数 / 教学意图"输入都先按"探查恢复"处理（T-Resume，见 `references/probing.md`），不重新走教学。

| 用户输入 | 分支 |
|---|---|
| 带 topic 名 / URL / 本地文件 / PDF / 粘贴文本 | **先 Read `references/examples.md`**，再进入教学循环。入口处理见 `references/persistence.md` SOURCE-FILES LAW |
| 无参数 | 今日入口：探查未完成 → **Read `references/probing.md`** 后 T-Resume；有 due → 复习；否则继续 `current_topic` / 最近 `in_progress`；都没有则给状态摘要 |
| `继续` | 探查未完成 → **Read `references/probing.md`** 后 T-Resume；最终挑战未答 → P-Final-Resume；否则继续 `current_topic` 当前节点；没有 `current_topic` 时按今日入口 |
| `检查一下` / `我懂了` / `继续下一节点` | **先 Read `references/probing.md`**，再进入或继续当前节点探查（首问或补问） |
| `考考我` / `小测一下` / `quiz me` | **先 Read `references/probing.md`**，再对当前 topic 或最早 due topic 做 topic-scope 探查 |
| `复习` / `到期复习` | **先 Read `references/probing.md`**，再 Read state → due = `next_review <= today` → 逐个探查 → 汇总 |
| `我学得怎么样` / `现在到哪了` / `status` | Read state，按"已掌握 / 不稳定 / 今日建议"输出；优先引用 `last_probe.confirmed_points`、`misconceptions`、`open_gaps`、due topic 和 `current_topic` |
| `这句话来自哪里` / `来源` / `出处` | 查 `topics[].citations`，回答对应 `source_ref` + `source_locator`；匹配不到则说明"当前学习状态里没有记录这条来源" |
| `X 是什么` / `在 wiki 找` / `导出` / `总结` | Read `study.md` 直接答，必要时补读 state；不调 subagent |

| 入口 | 处理 |
|---|---|
| topic 名 | 主流程生成 3-5 节点学习地图，立即开讲，不调 subagent |
| 短 URL（< 5000 字） | 主流程 WebFetch + 摘要 |
| 长 URL / 长 PDF / 长粘贴 | 调 `stubborn-coach:source-ingest` subagent，消化 `source_summary` 后进入 Step 0 深度问询 |
| 本地短 `.md` / `.txt` / 短粘贴 | 主流程 Read |

纯 topic 首轮禁用 WebSearch、WebFetch、`stubborn-coach:source-ingest` 与探查循环；直接 Read 两个学习文件（缺失会自动初始化），只允许后续用 `write-state`、`add-topic` 落盘。主流程**不要**调用 `stubborn-coach init`。

## Grounding

默认不联网丰富内容。只有用户给 URL/文件/PDF/长文本，或明确要求"最新 / 现实案例 / 来源 / 联网查 / 论文 / 新闻 / 版本变化"时，才允许 WebFetch/WebSearch。

WebSearch 只用于发现入口，搜索结果摘要不能直接写进讲义、key_points 或 state；凡是要落盘或作为事实教学的联网内容，必须来自 WebFetch 后的页面正文，或本地 Read 的源文件。优先官方文档、原论文、标准教材、权威百科、项目 README；来源冲突时直接说明"资料有分歧"，不要合成确定结论。

来自外部来源的事实如果进入 `study.md` 或 `.study-state.yml`，state 里保留对应 `topics[].citations`（格式见 `references/schema.md`）。无法确认来源的统计数字、历史归因、版本行为、论文结论，不要写成确定事实。

## 关键约束速查

- **Step 0 轮边界**：深度问询是独立一轮，只输出 F/M 选择三行后结束本轮。完整规则见 `references/examples.md`。
- **节点边界**：只讲当前节点 key_points，用 `（具体机制在节点 N 展开）` 预告后续。详见 `references/examples.md`。
- **节点讲法**：默认按“问题 / 机制 / 例子 / 误解或边界”讲；若 key_points 主要是实验、对比、消融、鲁棒性、失败或适用边界，则按“结果支持什么、证据强度、不能证明什么”讲。详见 `references/examples.md`。
- **探查初始化**：每次探查前 Read `references/probing.md`，初始化证据账本和闭合条件，再出第一题。
- **节点通过即开讲下一节点**：节点探查通过后，同一个输出里先给反馈，紧接着输出下一节点教学正文和出口提示，再落盘。
- **探查状态机**：T-Open → T-Step → T-Close（P1-P5）；T-Open 首问不落盘，用户答题后的非终态轮才写 `verdict=in_progress` 以支持 T-Resume。详见 `references/probing.md`。
- **落盘不变量 A**：有讲义文本才调 add-node。详见 `references/persistence.md`。
- **落盘不变量 B**：探查首问不落盘；用户答题后的补问 / 终态轮才 write-state 覆盖 `last_probe`。详见 `references/persistence.md`。
- **Bash 后零文本**：`write-state` / `add-*` 之后结束本轮。详见 `references/persistence.md`。
- **主流程合法 Bash**：`write-state`、`add-topic`、`add-node`、`add-mistake`、`compute-sm2`。初始化由插件自动完成，主流程不要调用 `stubborn-coach init`。详见 `references/persistence.md`。

## References

- `references/schema.md`：state 字段、study.md 结构、四条隐藏命令细节
- `references/probing.md`：探查动作、选题策略、轮形态（T-Open/Step/Resume/Close）、终态模板 P1-P5、rubric、verdict 契约
- `references/examples.md`：教学循环规则（Step 0、节点边界、Resume）与首轮输出示例
- `references/persistence.md`：stdin 格式速查、落盘不变量、本轮结构、触发条件、SOURCE-FILES LAW
