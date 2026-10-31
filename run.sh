#!/usr/bin/env bash
# 玻璃对撞实验室 启动脚本
#
#   ./run.sh            构建前端 + 后端 :8091 同源服务
#   ./run.sh dev        后端 :8091 + Vite :5181（热更新）
#   ./run.sh build      只构建前端
#   ./run.sh stop|status|log
#
# 依赖：node_modules（跑 ./install.sh）
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${GBD_PORT:-8091}"
WEB_PORT="${GBD_WEB_PORT:-5181}"
LOG_DIR="$DIR/logs"
PID_DIR="$DIR/.run"
mkdir -p "$LOG_DIR" "$PID_DIR"

is_up() { ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ":$1$"; }

wait_port() {
  local p="$1" name="$2" i
  for i in $(seq 1 60); do
    is_up "$p" && { echo "    $name 就绪 :$p"; return 0; }
    sleep 0.3
  done
  echo "    $name 启动超时（:$p），看日志：$LOG_DIR" >&2
  return 1
}

kill_pidfile() {
  local f="$1"
  if [ -f "$f" ]; then
    local pid
    pid=$(cat "$f")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 0.4
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$f"
  fi
}

start_backend() {
  if is_up "$PORT"; then
    echo "    后端已在 :$PORT 运行"
    return 0
  fi
  (cd "$DIR/server" && nohup npx tsx src/main.ts > "$LOG_DIR/server.log" 2>&1 & echo $! > "$PID_DIR/server.pid")
  wait_port "$PORT" "后端"
}

start_frontend_dev() {
  if is_up "$WEB_PORT"; then
    echo "    Vite 已在 :$WEB_PORT 运行"
    return 0
  fi
  (cd "$DIR/client" && nohup npx vite > "$LOG_DIR/vite.log" 2>&1 & echo $! > "$PID_DIR/vite.pid")
  wait_port "$WEB_PORT" "Vite"
}

do_build() {
  echo "==> 构建前端"
  npm run build -w client
  echo "    产物：client/dist"
}

case "${1:-start}" in
  dev)
    echo "==> 开发模式"
    start_backend
    start_frontend_dev
    echo
    echo "前端 http://127.0.0.1:$WEB_PORT   （/api 代理到 :$PORT）"
    ;;
  build)
    do_build
    ;;
  start|"")
    echo "==> 生产模式"
    do_build
    start_backend
    echo
    echo "打开 http://127.0.0.1:$PORT"
    ;;
  stop)
    echo "==> 停止"
    kill_pidfile "$PID_DIR/vite.pid"
    kill_pidfile "$PID_DIR/server.pid"
    echo "    已停止"
    ;;
  status)
    is_up "$PORT" && echo "后端  :$PORT  运行中" || echo "后端  :$PORT  未运行"
    is_up "$WEB_PORT" && echo "Vite  :$WEB_PORT  运行中" || echo "Vite  :$WEB_PORT  未运行"
    ;;
  log)
    tail -n 60 -f "$LOG_DIR"/*.log
    ;;
  *)
    echo "用法: $0 [dev|build|start|stop|status|log]" >&2
    exit 1
    ;;
esac
