#!/usr/bin/env bash
# Full build of one episode: narration -> picture -> sound, subtitles, checks -> readable script.
#   build.sh <episode_dir> [workers]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; py="$here/../../.venv/bin/python"; ep="$(cd "$1" && pwd)"; name="$(basename "$ep")"
log="$here/../logs/timelog.csv"
stamp() { echo "$(date +%s),$(date -Is),$name,$1,$2" >> "$log"; }
stamp tts start;      "$py" "$here/tts.py" "$ep/storyboard.json" "$ep/build" 2>&1 | grep -v RuntimeWarning; stamp tts end
stamp render start;   "$py" "$here/render.py" "$ep" --workers "${2:-6}" 2>&1 | grep -v RuntimeWarning; stamp render end
stamp assemble start; "$py" "$here/assemble.py" "$ep" 2>&1 | grep -v RuntimeWarning; stamp assemble end
"$py" "$here/script_md.py" "$ep" "$here/../scripts/$(jq -r .episode "$ep/storyboard.json")-script.md"
