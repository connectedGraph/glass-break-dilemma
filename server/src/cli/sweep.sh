#!/usr/bin/env bash
# 12 片并行扫参，结果写到 logs/sweep.jsonl，再按「红方险胜」排序打印
set -euo pipefail
cd "$(dirname "$0")/../../.."
mkdir -p logs
OUT=logs/sweep.jsonl
: > "$OUT"
N=${SHARDS:-12}
for i in $(seq 0 $((N - 1))); do
  npx tsx server/src/cli/sweep.ts --shard "$i/$N" >> "$OUT" &
done
wait
node -e '
const rows = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map(JSON.parse);
// 险胜：红方几乎每局都赢，但平均只领先 0.3–2 秒，时长 25–50 秒
const good = rows.filter(r => r.redRate >= 0.875 && r.margin > 0.3 && r.margin < 2 && r.duration >= 25 && r.duration <= 50)
  .sort((a, b) => a.margin - b.margin);
console.log(`共 ${rows.length} 组，符合「红方险胜」的 ${good.length} 组`);
for (const r of good.slice(0, 15)) console.log(JSON.stringify(r));
' "$OUT"
