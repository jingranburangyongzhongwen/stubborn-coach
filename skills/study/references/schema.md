# study 数据模型

stubborn-coach 把学习数据拆成两份：

- `learning-wiki/.study-state.yml`：内部机器状态，主流程 resume、probe、SM-2 都读它。
- `learning-wiki/study.md`：用户可读知识库 / 教案，只追加主题、节点讲义、节点错题，不保存动态进度段。

## `.study-state.yml` 字段

```yaml
type: study-log
generated_at: 2026-04-30
current_topic: e-mc2
topics:
  - id: e-mc2
    title: 质能方程 (E=mc²)
    target_depth: familiar
    source:
      kind: topic
      ref: ""
      ingested_at: 2026-04-30
    current_node_idx: 2
    map:
      - idx: 1
        label: 基本含义
        done: true
        key_points:
          - 静止物体也有 E=mc² 对应的能量
      - idx: 2
        label: 历史与起源
        done: false
        key_points:
          - c² 是单位换算系数
    progress: "1/2"
    last_studied: 2026-04-30
    next_review: 2026-05-01
    interval_days: 1
    repetitions: 1
    ease_factor: 2.5
    status: in_progress
    key_points:
      - 质量与能量是同一物理量的两种表现
    citations:                         # 可选；仅外部来源事实需要
      - node: 1
        key_point: 静止物体也有 E=mc² 对应的能量
        source_ref: "example.pdf"
        source_locator: "第 2 章 / 第 3 段"
    misconceptions:
      - 误以为质量"变成"能量而消失
    last_probe:
      scope: { type: node, node_idx: 1 }
      target_depth: familiar
      verdict: pass                       # in_progress | pass | partial | fail
      quality: 4                          # in_progress 时为 null
      question_count: 2
      evidence_ledger:
        key_points_status:                # 广度：每 key_point 一行
          - { idx: 1, label: 静止物体也有 E=mc² 对应的能量, status: ok }
          - { idx: 2, label: c² 是单位换算系数, status: ok }
        accurate: ok                      # 深度 4 维
        explained: ok
        applied: missing
        discriminated: missing
      actions_used: [probe_core, socratic_followup]
      current_question: null              # in_progress 时写 { action, text, targets, asked_at }
      confirmed_points:
        - 质量和能量是同一物理量的两种表达
      misconceptions: []
      open_gaps: []
      evidence_summary: 用户能解释静止物体因质量本身对应能量。
      stopped_early_reason: evidence_sufficient
      recommended_next_action: 进入节点 2，讲 c² 为什么让少量质量对应巨大能量。
      probed_at: 2026-04-30
```

## 字段更新时机

| 字段 | 何时更新 / 值的来源 |
|---|---|
| `generated_at` | 每次 `write-state` 改成今天日期 |
| `current_topic` | 用户切换 topic、首次创建 topic、resume 时 |
| `topics[].id / title / source` | topic 首次创建时；之后不变 |
| `topics[].target_depth` | topic 创建时由 Step 0 选择或关键词直接设为 mastered |
| `topics[].current_node_idx` | topic 创建时设为 1；节点 pass 后 +1；partial/fail 保持当前节点 |
| `topics[].map` | topic 创建时一次性生成；节点 pass 时只把对应 `done` 翻 true |
| `topics[].progress` | `map` 翻位后重算 `done 节点数 / 总数` |
| `topics[].last_studied` | 进入教学循环、探查、复习或暂停保存时设为今天 |
| `topics[].key_points` | topic 创建时生成的全局摘要；node 探查只用当前节点 `map[].key_points` |
| `topics[].citations` | 可选；只有 URL/PDF/文件/WebFetch 等外部来源事实进入 key_points 或讲义时写入，用于追溯来源 |
| `topics[].misconceptions` | 每次 `last_probe.misconceptions` 追加去重；node/topic/review 都可写 |
| `topics[].last_probe` | 探查每一轮（首问 / 补问 / 终态）都完整覆盖；非终态保留 `verdict: in_progress` + `evidence_ledger` + `current_question` 以便 T-Resume 接续；只保存结构化摘要，不保存完整问答转录 |
| `topics[].next_review / interval_days / repetitions / ease_factor` | 仅完整 topic/review 探查后按 `references/sm2.md` 计算 |
| `topics[].status` | topic/review 后按 quality 推断；node 验证保持 `in_progress`，除非全节点完成 |

`write-state` 是全量覆盖。`type: study-log` 是固定常量，CLI 会在漏写时自动补到顶部，但会拒绝其它 `type` 值。CLI 还会做一条机械校验：

- **节点进度不变量**：每个 topic 的 `map[].done` 必须是 true-prefix（已完成节点紧接在前），且 `current_node_idx == done 中 true 的数量 + 1`。违反前者报 `STATE_NODE_DONE_NOT_PREFIX`，违反后者报 `STATE_NODE_IDX_MISMATCH`。这条不变量保证 P1-P5 模板间状态自洽：节点 pass 翻 done + 自增 idx 必须一起做；最后节点 pass 时 `current_node_idx = max + 1` 与 `done 全 true` 匹配；P3（最终挑战恢复）的判定条件 `current_node_idx == max + 1` 因此是无歧义的。

`citations` 是最小防幻觉字段，不要求纯 topic 常识教学填写。只有外部来源事实落盘时才写，每条至少包含 `node`、`key_point`、`source_ref`、`source_locator`。WebSearch 摘要不能作为 citation，必须指向 WebFetch 页面或本地 Read 源文件。

## `study.md` 知识库结构

`study.md` 没有 frontmatter，也不写 `## 当前学习`、`#### 复习建议`、topic 级 `易错点 / 待补强`。学习地图不带 `[x]` / `[ ]` 进度复选框。

```markdown
# 学习日志

## 知识库

<!-- topic:e-mc2 -->
### 质能方程 (E=mc²)

#### 学习目标
- ...

#### 学习地图
- 1. 基本含义
- 2. 历史与起源

#### 节点讲义

<!-- node:1 -->
##### 1. 基本含义
...

<!-- mistakes:e-mc2/1 -->
###### 错题
- ...

<!-- node:2 -->
##### 2. 历史与起源
...
```

## 写入命令

- `write-state`：从 stdin 接收完整 YAML，覆盖 `.study-state.yml`。
- `add-topic --id <topic-id>`：从 stdin 接收单个 `### {标题}` 主题骨架，CLI 在文件末尾前置 `<!-- topic:{id} -->`，并在 `##### 1.` 前自动插入 `<!-- node:1 -->`。
- `add-node --topic <topic-id> --idx <n>`：从 stdin 接收单个 `##### {n}. {标签}` 节点讲义，CLI 在该 topic 段尾追加 `<!-- node:{n} -->` + 内容，且 `n` 必须等于当前最大 node idx + 1。
- `add-mistake --topic <topic-id> --node <n>`：从 stdin 接收一条或多条 `- {错题}`，CLI 在对应 node 的错题段尾追加；首次自动创建 `<!-- mistakes:{topic}/{n} -->` + `###### 错题`。

主流程禁止调用 Write/Edit/MultiEdit 写这两个文件；只能通过上述隐藏 CLI 落盘。CLI 不做错题去重，LLM 在生成 stdin 前按字符串相等去重。
