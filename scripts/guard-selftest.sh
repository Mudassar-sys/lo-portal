#!/usr/bin/env bash
# Permanent positive test for scripts/guard.sh.
#
# Why this exists: the first version of the guard's dash check searched for the
# literal text a dollar-quoted unicode escape produces on a bash build that
# does not expand it, so it could never have matched a real em dash and the
# guard passed for the wrong reason. A guard that cannot fail is not a guard.
#
# The test runs inside a throwaway git repository, never against this one, so
# it is safe to run from a pre-commit hook: it does not touch the real index.
#
# Every banned term and character below is assembled from fragments or byte
# escapes, because the guard scans this file too.
set -uo pipefail

guard="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/guard.sh"
[ -f "$guard" ] || { echo "SELFTEST FAIL: guard.sh not found"; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cd "$tmp"
git init -q -b main .
git config user.email "selftest@example.invalid"
git config user.name "selftest"

NAME="Re""idy"
EMDASH="$(printf '\xe2\x80\x94')"
KEY="sb_""secret_""abcdefghijklmnopqrstuvwxyz0123"

{
  echo "line one has a dash ${EMDASH} here"
  echo "line two names the client ${NAME} Inc"
  echo "line three carries a key ${KEY}"
} > poison.txt
git add poison.txt

out="$(bash "$guard" 2>&1)"; rc=$?
fail=0

if [ "$rc" -eq 0 ]; then
  echo "SELFTEST FAIL: guard passed a file it must reject"
  fail=1
fi

check() {
  if ! printf '%s' "$out" | grep -qi -- "$1"; then
    echo "SELFTEST FAIL: guard did not report $2"
    fail=1
  fi
}
check "GUARD FAIL (tracked)" "the client name in a tracked file"
check "GUARD FAIL (staged)"  "the client name in staged content"
check "em dash or en dash"   "the em dash"
check "possible key material" "the secret key"

# And a file NAMED after a banned term, which content checks cannot see.
badname="cla""ude-notes.md"
echo "harmless contents" > "$badname"
git add "$badname"
out2="$(bash "$guard" 2>&1)"
if ! printf '%s' "$out2" | grep -q "GUARD FAIL (path)"; then
  echo "SELFTEST FAIL: guard did not report a banned term in a file name"
  fail=1
fi
git rm -q --cached "$badname"
rm -f "$badname"

# And it must pass once the poison is gone.
git rm -q --cached poison.txt
rm -f poison.txt
if ! bash "$guard" >/dev/null 2>&1; then
  echo "SELFTEST FAIL: guard rejects a clean tree"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "SELFTEST PASS: every guard check fires on a poisoned tree and clears on a clean one"
fi
exit "$fail"
