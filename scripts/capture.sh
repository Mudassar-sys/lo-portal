#!/usr/bin/env bash
# Capture command output into docs/evidence with the absolute build path
# redacted, so no directory name from the build machine can leak into a
# committed evidence file.
set -uo pipefail
out="$1"; shift
root="$(git rev-parse --show-toplevel)"
parent="$(dirname "$root")"
mkdir -p "$(dirname "$out")"
{
  echo "\$ $*"
  echo "captured $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "---"
  "$@" 2>&1
  echo "---"
  echo "exit=$?"
} | sed -e "s|$(printf '%s' "$parent" | sed 's/[\/&]/\&/g')|<path>|g" \
        -e "s|$(printf '%s' "$parent" | tr '/' '\' | sed 's/[\&]/\&/g')|<path>|g" \
    > "$out"
cat "$out"
