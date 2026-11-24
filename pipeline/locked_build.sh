#!/usr/bin/env bash
# Run build.sh under a machine-wide lock so only one episode renders at a time (parallel agents share this laptop).
#   locked_build.sh <episode_dir> [workers]
exec flock .render.lock bash "$(dirname "$0")/build.sh" "$@"
