# 调参与诊断脚本

| 脚本 | 用途 |
|---|---|
| `probe.ts [seed]` | 单局：双方破镜时刻、撞击数、球-球碰撞数、胜负。`npm run sim` |
| `balance.ts` | 三档预设 16 个种子下的红胜率、领先秒数分布、时长。`npm run balance` |
| `sweep.sh` | 12 片并行粗扫（层数 × 首层 × 倍率 × 容量），结果写 `logs/sweep.jsonl` |
| `refine.ts <first> <ratio>` | 13 层下某条曲线 16 个种子的领先秒数分布 |
| `robust.ts <first> <ratio> <shard>` | 64 个随机种子稳健性（分 4 片并行） |
| `spread.ts` | 球群在空窗里的竖直分布，判断球是不是真的在上下弹 |

改动引擎或默认参数后必须重跑 `balance.ts`。这个系统的相变很陡：
倍率 1.55 → 1.54 能让标准局从「红方 16/16」变成「红方 0/16」。
