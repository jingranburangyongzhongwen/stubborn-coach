# 首轮输出示例

主流程在执行 `study` 教学循环时必须满足 SKILL.md 的：
1. **Step 0**：新 topic 先确认目标深度
2. **教学输出契约**：学习地图 / 元控制提示 / 节点教学 / 节点出口提示
3. **探查循环**：用户准备好后主流程内嵌探查，按 `references/probing.md` 判定过线
4. **节点边界规则**：当前节点不展开后续节点概念
5. **落盘约束**：只用隐藏 CLI `write-state` / `add-topic` / `add-node` / `add-mistake`，不要用 Write/Edit/MultiEdit

## 示例 1：topic 入口

### 用户首条消息

```
/stubborn-coach:study 质能方程
```

### 主流程第 1 轮（Step 0）

```
我会带你学 **质能方程 (E=mc²)**。先确认一下深度（默认 familiar）：
[F] familiar — 能用自己的话解释、识别常见误解就行
[M] mastered — 还要能在新场景下推导/应用
```

（不输出学习地图，不调任何 subagent，等用户回复）

### 用户回复

```
F
```

### 主流程第 2 轮（First-Round Output → CLI 落盘 → 结束本轮）

终端文本（注意：不出题，不要求用户立刻作答；结尾是节点出口提示）：

```
学习 **质能方程 (E=mc²)** — 目标深度：familiar

学习地图（4 节点）：
1. 基本含义：E=mc² 这个等式在说什么
2. c² 量级：为什么转换系数这么大
3. 历史与起源：Einstein 1905 推导脉络
4. 质量亏损与核反应：能量"释放"机制

> 任何时候你都可以直接说："换个例子" / "检查一下" / "现在小测" / "暂停保存" / "回到节点 N" / "换主题 X"。我会按你说的走。

---
**节点 1：基本含义**

E=mc² 是一个等式，它告诉你三件事：

1. 等号两边是同一个物理量的两种表达——左边叫"能量"，右边叫"质量乘以光速平方"。
2. 任何静止的物体本身就持有能量 E = mc²，不需要它运动也不需要它"做什么"才有能量。
3. 因此 m 和 E 之间不存在"谁变成谁"，它们是同一本账上的两种记账方式，c² 只是单位换算系数。

（"质量亏损 → 释放能量"的具体机制留到节点 4 展开，这里只需先建立"质量本身就是能量"的直觉。）

这个节点先讲到这里。你可以继续追问这个节点；如果觉得差不多了，说"检查一下"，我会用一个短问答确认能不能进入下一节点。
```

随后先用 `stubborn-coach write-state` 落 `.study-state.yml`，再用 `stubborn-coach add-topic --id e-mc2` 把主题骨架、学习地图和节点 1 讲义追加到 `study.md`，Bash 完成后直接结束本轮，不补充任何文字。state 中 `current_node_idx=1`，且每个 map 节点都有自己的 `key_points`：

```yaml
current_node_idx: 1
map:
  - idx: 1
    label: 基本含义
    done: false
    key_points:
      - 静止物体也有 E=mc² 对应的能量
      - 质量和能量是同一物理量的两种表达
      - c² 是单位换算系数
  - idx: 2
    label: c² 量级
    done: false
    key_points:
      - 光速平方是巨大的换算系数
      - 少量质量对应巨大能量
```

### 用户继续追问当前节点

```
为什么说静止物体也有能量？
```

主流程继续解释当前节点，不进入探查、不翻 done、通常不落盘：

```
这里的"静止"只是不包含运动能量。E=mc² 说的是物体光是因为有质量，就已经对应一份静止能量。

你可以把它理解成：质量不是能量之外的东西，而是能量的一种储存方式。运动能量只是额外加上去的一层。

这个节点先讲到这里。你可以继续追问这个节点；如果觉得差不多了，说"检查一下"，我会用一个短问答确认能不能进入下一节点。
```

### 用户准备验证

```
检查一下
```

主流程进入探查循环，按需读取 `references/probing.md`，先问一个高信息量问题：

```
检查一下节点 1。

如果一个静止的小石头没有运动，它还有没有 E=mc² 对应的能量？请用自己的话说清楚：这是"质量变成能量消失了"，还是"质量和能量是同一物理量的两种表达"？
```

用户回答：

```
有。它不是因为运动才有这部分能量，而是质量本身就对应能量。不是质量消失变成能量，而是同一个东西用质量或能量两种单位表达。
```

主流程内部评估 rubric，证据足够后停止探查，终端只展示简短结果：

```
节点 1 通过。

你已经能说清楚：静止物体也有静止能量，质量和能量不是"互相变没"的关系，而是同一物理量的两种表达。

下一步进入节点 2：c² 为什么让少量质量对应巨大能量。
```

随后用 `write-state` 落盘：`last_probe.verdict=pass`、节点 1 `done=true`、`current_node_idx=2`、progress 改成 `1/4`；再用 `add-node --topic e-mc2 --idx 2` 追加节点 2 讲义。Bash 完成后不补充文字。`last_probe` 结构示例：

```yaml
last_probe:
  scope: { type: node, node_idx: 1 }
  verdict: pass
  quality: 4
  evidence_state: sufficient
  question_count: 1
  confirmed_points:
    - 静止物体也有 E=mc² 对应的能量
    - 质量和能量是同一物理量的两种表达
  misconceptions: []
  open_gaps: []
  evidence_summary: 用户能解释静止物体因质量本身对应能量，未暴露"质量消失"误解。
  stopped_early_reason: evidence_sufficient
  recommended_next_action: 进入节点 2，讲 c² 为什么让少量质量对应巨大能量。
  probed_at: 2026-04-30
```

### 用户验证失败并中断

如果用户回答：

```
我理解是质量会变成能量，所以石头不动的时候应该没有释放能量，只有反应时才会有。
```

主流程不要推进节点，也不要补完整新课；先给短反馈和下一步：

```
这里还不能进入下一节点。

你现在混在一起的是两件事：静止质量本身对应能量，和核反应里因为质量亏损释放出可见能量。我们先把"质量本身对应能量"这个点重新拆开。

下一轮我会换一个更小的例子讲：为什么一个没有发生反应的静止物体，仍然有 E=mc² 对应的静止能量。
```

随后仍然必须用 `write-state` 保存失败状态；节点 1 `done=false`，`current_node_idx` 仍为 1；再用 `add-mistake --topic e-mc2 --node 1` 追加本轮新增错题：

```yaml
current_node_idx: 1
last_probe:
  scope: { type: node, node_idx: 1 }
  verdict: fail
  quality: 0
  evidence_state: insufficient
  question_count: 1
  confirmed_points: []
  misconceptions:
    - 把静止质量对应能量和核反应释放能量混为一谈
  open_gaps:
    - 还不能区分"质量本身对应能量"和"质量亏损释放能量"
  evidence_summary: 用户把 E=mc² 理解成质量在反应时才变成能量，未建立静止能量直觉。
  stopped_early_reason: blocking_misconception
  recommended_next_action: 回到节点 1，用静止物体 vs 核反应两个例子拆开讲。
  probed_at: 2026-04-30
```

如果此时用户关掉终端，下次 resume 读 `current_node_idx=1` 与 `last_probe.open_gaps`，第一轮应回到节点 1 补讲，而不是进入节点 2。

## 示例 2：主动小测 / 到期复习

用户说：

```
现在小测
```

主流程进入同一个探查循环，只改 scope：

```yaml
scope:
  type: topic
budget:
  max_questions: 3
```

到期复习则：

```yaml
scope:
  type: review
budget:
  max_questions: 3
```

同一个 `last_probe` 输出；只有 `topic|review` 的结果用于 SM-2，`node` 结果只用于决定能否进入下一节点。

## 反例（FAIL）

### 反例 A：节点末尾直接出题

```
**理解检查**：一个静止的小石头，它有能量吗？为什么？
```

错误：主流程不负责验证，不应该出题。应输出节点出口提示，让用户选择继续追问或说"检查一下"。

### 反例 B：主流程自行判断过线

```
你回答得对，节点 1 通过，我们继续节点 2。
```

错误：节点能否通过必须由探查循环生成的 `last_probe.verdict` 决定。

### 反例 C：理解检查后贴数字菜单

```
[1] 继续 [2] 换个例子 [3] 现在小测 [4] 暂停保存
```

错误：节点末尾只放自然语言出口提示；用户用自然语言触发 routing table。

### 反例 D：检查前就翻 done

用户只是说"大概懂了"，主流程没有完成探查，却把节点 done 改成 true。错误：只有 `last_probe.scope.type=node && verdict=pass` 才能触发 `node_completed`。

### 反例 E：普通答疑也落盘

用户只是继续追问当前节点，主流程不应调用隐藏写入命令。落盘只发生在 topic 创建、验证结果、切 topic、暂停保存等事件。

### 反例 F：用 Write/Edit/MultiEdit 写文件

这些工具会在终端渲染 diff。必须用 `stubborn-coach write-state` / `add-topic` / `add-node` / `add-mistake` 的 heredoc 命令。
