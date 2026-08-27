#!/usr/bin/env bash
set -euo pipefail

ROOT="${A8_HW_ROOT:-/srv/apps/a8_time_lab_v5_4_20_postseal_hw}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-18020}"

cd "$ROOT"

exec env \
  HOST="$HOST" \
  PORT="$PORT" \
  node hardware/a8-postseal-hardware-lab-server.js
