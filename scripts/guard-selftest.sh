#!/usr/bin/env bash
# Permanent positive test for scripts/guard.sh.
#
# Why this exists: the first version of the guard's dash check searched for the
# literal text a dollar-quoted unicode escape produces on a bash build that
# does not expand it, so it could never have matched a real em dash and the
# guard passed for the wrong reason. A guard that cannot fail is not a guard.
# Every check it makes is provoked here and must fire.
#
# The test runs inside a throwaway git repository, never against this one, so
# it is safe to run from a pre-commit hook: it does not touch the real index.
#
# Every banned term and character below is assembled from fragments or byte
# escapes, because the guard scans this file too.
#
# Note the shape of every assertion: the guard's output is captured into a
# variable and then searched. It is never piped into grep -q. grep -q exits on
# the first match, the guard then dies of SIGPIPE writing its remaining lines,
# and with pipefail the pipeline reports that as a failure even though the
# guard did exactly the right thing. That produced a false failure here once.
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

fail=0

# ---------------------------------------------------------------------------
# 1. Content: a banned name, a real em dash and a secret shaped string.
# ---------------------------------------------------------------------------
{
  echo "line one has a dash ${EMDASH} here"
  echo "line two names the client ${NAME} Inc"
  echo "line three carries a key ${KEY}"
} > poison.txt
git add poison.txt

out="$(bash "$guard" 2>&1)"; rc=$?

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
check "GUARD FAIL (tracked)"  "the client name in a tracked file"
check "GUARD FAIL (staged)"   "the client name in staged content"
check "em dash or en dash"    "the em dash"
check "possible key material" "the secret key"

git rm -q --cached poison.txt
rm -f poison.txt

# ---------------------------------------------------------------------------
# 2. A file NAMED after a banned term, which a content scan cannot see.
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# 3. An environment file under any name.
#
# This is the case that got through in practice: a file saved as
# .env.local.txt matched no ignore rule and no check, and sat in the working
# tree holding live credentials, untracked but perfectly committable.
# ---------------------------------------------------------------------------
for envname in ".env.local" ".env.local.txt" ".env.production" ".env" ".env.local.bak"; do
  echo "SOME_NAME=some-value" > "$envname"
  git add -f "$envname"
  out3="$(bash "$guard" 2>&1)"
  if ! printf '%s' "$out3" | grep -q "an environment file is tracked or staged"; then
    echo "SELFTEST FAIL: guard did not refuse a tracked $envname"
    fail=1
  fi
  git rm -q --cached "$envname"
  rm -f "$envname"
done

# ---------------------------------------------------------------------------
# 4. The one environment file that is allowed must still pass.
# ---------------------------------------------------------------------------
echo "NAME_ONLY=" > .env.example
git add -f .env.example
if ! out4="$(bash "$guard" 2>&1)"; then
  echo "SELFTEST FAIL: guard refused .env.example, which is the one allowed file"
  echo "$out4"
  fail=1
fi
git rm -q --cached .env.example
rm -f .env.example

# ---------------------------------------------------------------------------
# 5. A clean tree passes.
# ---------------------------------------------------------------------------
if ! bash "$guard" >/dev/null 2>&1; then
  echo "SELFTEST FAIL: guard rejects a clean tree"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "SELFTEST PASS: every guard check fires on a poisoned tree and clears on a clean one"
fi
exit "$fail"
