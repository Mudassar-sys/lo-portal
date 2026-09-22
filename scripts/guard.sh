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

TERMS=(
  "re""idy" "san""more" "bo""ris" "san""chez" "mc""intyre" "hir""sch"
  "up""work" "cla""ude" "anth""ropic" "chat""gpt" "cop""ilot" "ope""nai"
  "gemi""ni" "cur""sor.sh"
)

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

# 5. .env.local must never be tracked.
if git ls-files --error-unmatch .env.local >/dev/null 2>&1; then
  echo "GUARD FAIL: .env.local is tracked"
  fail=1
fi

# 6. The deployable build output, when one exists. .next/cache is excluded on
# purpose: Turbopack's filesystem cache snapshots the environment variables of
# whatever shell ran the build, so it can hold names from the operator's own
# machine. That directory is gitignored and is never uploaded to a deployment,
# while everything else under .next is the artefact that actually ships.
if [ -d .next ]; then
  for t in "${TERMS[@]}"; do
    hits=$(find .next -type f -not -path ".next/cache/*" -exec grep -lia -- "$t" {} + 2>/dev/null || true)
    if [ -n "$hits" ]; then
      echo "GUARD FAIL (build output): term '$t' in:"
      echo "$hits"
      fail=1
    fi
  done
fi

if [ "$fail" -eq 0 ]; then
  echo "GUARD PASS: tracked and staged content clean"
fi
exit "$fail"
