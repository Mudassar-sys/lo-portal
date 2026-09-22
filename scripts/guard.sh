#!/usr/bin/env bash
# Repository guard. Run before every commit: npm run guard
#
# The portal carries an invented brand. No client name, no person name, no
# company name other than the brand, and no reference to any AI tool may enter
# this repository. The guard reads git tracked and git staged content only,
# because untracked build output (.next) legitimately contains the absolute
# build path of whatever machine built it and is never committed.
#
# The guard scans itself, so the terms below are assembled from fragments and
# never appear as whole words in this file.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

# Names of the client, its sister company, its people and the platform. These
# must not appear in anything this repository produces, tracked or built.
NAME_TERMS=(
  "re""idy" "san""more" "bo""ris" "san""chez" "mc""intyre" "hir""sch" "up""work"
)

# AI tooling. These are banned in content this repository authors. They are not
# applied to the build output, because a bundled dependency can carry such a
# string in its own source or docstrings, which is neither ours to remove nor
# evidence of anything. Check 1 and check 2 cover everything we write.
TOOL_TERMS=(
  "cla""ude" "anth""ropic" "chat""gpt" "cop""ilot" "ope""nai" "gemi""ni" "cur""sor.sh"
)

TERMS=("${NAME_TERMS[@]}" "${TOOL_TERMS[@]}")

fail=0

# 1. Tracked files in the working tree.
for t in "${TERMS[@]}"; do
  hits=$(git grep -In -i -e "$t" -- . 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "GUARD FAIL (tracked): term '$t'"
    echo "$hits"
    fail=1
  fi
done

# 2. Staged content, which is what a commit would actually record.
for t in "${TERMS[@]}"; do
  hits=$(git diff --cached -U0 -i -G"$t" --name-only 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "GUARD FAIL (staged): term '$t' in:"
    echo "$hits"
    fail=1
  fi
done

# 3. Em dash and en dash are banned in every file of the deliverable.
# The characters are built from UTF-8 bytes rather than written literally, so
# this file does not trip its own check. Note that the bash dollar-quote form
# for a unicode code point is not expanded by every bash build, so printf with
# byte escapes is the portable form and the only one that actually matches.
EMDASH=$(printf '\xe2\x80\x94')
ENDASH=$(printf '\xe2\x80\x93')
dash=$(git grep -In -e "$EMDASH" -e "$ENDASH" -- . 2>/dev/null || true)
if [ -n "$dash" ]; then
  echo "GUARD FAIL: em dash or en dash found"
  echo "$dash"
  fail=1
fi

# 4. No key material. A publishable key is safe in a bundle; a secret key is
# not, and a legacy service_role key must not be referenced in code at all.
# The signatures are fragmented so this file does not trip its own check.
KEYSIG=(
  "sb_""secret_[A-Za-z0-9_-]{16,}"
  "eyJ""hbGciOi"
  "SUPABASE_""SERVICE_ROLE"
  "servic""e_role_key"
  "sb_""publishable_[A-Za-z0-9_-]{16,}"
)
for k in "${KEYSIG[@]}"; do
  hits=$(git grep -InE -e "$k" -- . 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "GUARD FAIL: possible key material"
    echo "$hits"
    fail=1
  fi
done

# 5. No environment file may be tracked or staged, whatever it is called.
#
# The earlier version of this check named .env.local only. That is exactly the
# hole that let a file saved as .env.local.txt sit in the working tree holding
# live credentials, matched by no ignore rule and caught by no check. Anything
# beginning .env is refused here; the example file, which carries names and no
# values, is the one exception. git ls-files reads the index, so a staged file
# is caught before it can be committed.
envtracked=$(git ls-files -- '.env*' | grep -v '^\.env\.example$' || true)
if [ -n "$envtracked" ]; then
  echo "GUARD FAIL: an environment file is tracked or staged:"
  echo "$envtracked"
  fail=1
fi

# 6. The deployable build output, when one exists.
#
# Two directories are excluded, neither of which is the artefact:
#   .next/cache   Turbopack's filesystem cache, which snapshots the
#                 environment variables of whatever shell ran the build and so
#                 can hold names from the operator's own machine.
#   .next/dev     what next dev writes. Next.js 16 gives dev and build separate
#                 output directories and only the build output is deployed.
# Both are gitignored. Everything else under .next is what actually ships, and
# it is scanned.
if [ -d .next ]; then
  for t in "${NAME_TERMS[@]}"; do
    hits=$(find .next -type f -not -path ".next/cache/*" -not -path ".next/dev/*" -exec grep -lia -- "$t" {} + 2>/dev/null || true)
    if [ -n "$hits" ]; then
      echo "GUARD FAIL (build output): term '$t' in:"
      echo "$hits"
      fail=1
    fi
  done
fi

# 7. File and directory NAMES, not just contents. A file called after one of
# these terms, or a directory named for a tool, is as visible to a reviewer as
# a line inside a file, and checks 1 and 2 read contents only.
paths=$(git ls-files)
for t in "${TERMS[@]}"; do
  hits=$(printf '%s
' "$paths" | grep -i -- "$t" || true)
  if [ -n "$hits" ]; then
    echo "GUARD FAIL (path): term '$t' in the name of:"
    echo "$hits"
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "GUARD PASS: tracked and staged content clean"
fi
exit "$fail"
