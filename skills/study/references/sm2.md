# SM-2 计算（主流程在测验后调用）

主流程探查循环结束后，先把 `last_probe` 写入 `.study-state.yml`。只有测验覆盖完整已完成 topic，或到期复习覆盖已学内容时，才拿其中的 `quality`（0-5）算出下次复习时间，再写回 `.study-state.yml` 中对应 topic 的 4 个字段：`next_review`、`interval_days`、`repetitions`、`ease_factor`。

未完成 topic 的主动小测只用于校准已经学过的节点：写 `last_probe`、误解和下一步建议，但不更新 SM-2，也不把整个 topic 标成 `met_target`。

## 输入

- `quality`：0-5 整数，由探查循环评估并写入 `last_probe`
- 当前 topic 的 4 个状态字段（首次测验时按默认值初始化：`interval_days=0`、`repetitions=0`、`ease_factor=2.5`、`next_review` 为空）
- `today`：今天的本地日期 YYYY-MM-DD

## 算法（伪代码）

```
function sm2(prev, quality, today):
    ease  = prev.ease_factor or 2.5
    reps  = prev.repetitions or 0
    intv  = prev.interval_days or 0

    if quality < 3:                     # 失败：重新开始
        reps = 0
        intv = 1
    else:
        reps = reps + 1
        if reps == 1:
            intv = 1
        elif reps == 2:
            intv = 6 if quality == 5 else 3
        else:
            intv = max(1, round(intv * ease))
        ease = max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

    return {
        last_reviewed: today,
        next_review:   today + intv days,
        interval_days: intv,
        repetitions:   reps,
        ease_factor:   round(ease, 2),
    }
```

## status 推断

quality → status 由主流程同步推断（不依赖 SM-2）：

- `quality >= 4` → `met_target`
- `quality < 3`  → `needs_review`
- 其余           → `in_progress`

## 首次教学完成的初始化

用户首次完成一个 topic 的首轮教学（不一定经过测验）时，主流程把该 topic 初始化为：

```
last_studied: today
next_review:  today + 1 day
interval_days: 1
repetitions: 0
ease_factor: 2.5
status: in_progress
```

之后任何一次测验都用上面的 SM-2 公式更新这 5 个字段。
