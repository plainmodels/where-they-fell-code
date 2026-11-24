#!/usr/bin/env bash
# Contact sheet for visual quality control: sheet.sh <episode_dir> <out.jpg> <t1> <t2> ... (6 times → 3x2 grid)
set -euo pipefail
ep="$1"; out="$2"; shift 2
"$(dirname "$0")/../../.venv/bin/python" "$(dirname "$0")/render.py" "$ep" --still "$@" >/dev/null 2>&1
ins=(); for t in "$@"; do ins+=(-i "$ep/build/stills/$(printf 't%07.2f.jpg' "$t")"); done
ffmpeg -loglevel error -y "${ins[@]}" -filter_complex "$(for i in $(seq 0 $(($#-1))); do printf '[%d:v]scale=960:540[v%d];' $i $i; done)$(for i in $(seq 0 $(($#-1))); do printf '[v%d]' $i; done)xstack=inputs=$#:layout=0_0|960_0|1920_0|0_540|960_540|1920_540" -q:v 3 "$out"
