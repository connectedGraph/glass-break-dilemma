#!/usr/bin/env bash
# 安装依赖（幂等）。只装 npm 依赖，不碰系统。
#
#   ./install.sh          装依赖并做一次类型检查
#   ./install.sh --no-check   只装依赖
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "==> 检查 Node 版本"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "需要 Node >= 22（node:sqlite 是内置的），当前 $(node -v)" >&2
  exit 1
fi
echo "    Node $(node -v)"

echo "==> 安装依赖"
# 有 lockfile 用 npm ci（更快更可复现），否则 i
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

mkdir -p server/data

if [ "${1:-}" != "--no-check" ]; then
  echo "==> 类型检查"
  npm run typecheck
fi

echo
echo "完成。下一步："
echo "  ./run.sh dev     # 开发（Vite 热更新）"
echo "  ./run.sh         # 生产（构建后同源）"
