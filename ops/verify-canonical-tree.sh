#!/usr/bin/env bash
set -u

ROOT="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." &&
  pwd
)"

POLICY="$ROOT/ops/web-tombstones/a8-web-tombstones.tsv"
FAIL=0

pass() {
    echo "PASS · $*"
}

fail() {
    echo "FAIL · $*"
    FAIL=1
}

echo "===== A8 · CANONICAL REPOSITORY GUARD ====="

if [ ! -f "$POLICY" ]; then
    echo "FAIL · missing web tombstone policy"
    exit 1
fi

while IFS='|' read -r TYPE ENTRY_PATH REST; do
    case "${TYPE:-}" in
        REPO_FORBID)
            if [ -e "$ROOT/$ENTRY_PATH" ]; then
                fail "retired web artifact exists: $ENTRY_PATH"
            else
                pass "retired web artifact absent: $ENTRY_PATH"
            fi
            ;;

        REPO_REQUIRE)
            if [ -f "$ROOT/$ENTRY_PATH" ]; then
                pass "canonical exists: $ENTRY_PATH"
            else
                fail "canonical missing: $ENTRY_PATH"
            fi
            ;;
    esac
done < "$POLICY"

echo
echo "===== HARDWARE NAME SAFETY ====="

if grep -Ei \
  '^(FORBID_FILE|REPO_FORBID|TOMBSTONE).*(arduino|shadow|ghost)' \
  "$POLICY"
then
    fail "hardware terminology entered web-retirement rules"
else
    pass "Arduino / Shadow / Ghost hardware not selected by tombstones"
fi

echo
echo "===== PROTECTED CE ====="

for F in \
  sites/ce.cosigo.io/public/index.html \
  sites/ce.cosigo.io/public/chief-engineer.html
do
    if [ -f "$ROOT/$F" ]; then
        pass "$F"
    else
        fail "missing protected CE file: $F"
    fi
done

echo
echo "===== PROTECTED TELESCOPE ====="

if [ -f "$ROOT/protected/telescope/telescope.html" ]; then
    pass "active Telescope snapshot present"
else
    fail "active Telescope snapshot missing"
fi

echo
echo "===== WORKING BACKUP CHECK ====="

COUNT="$(
  find "$ROOT/sites" \
    -type f \
    -name '*.before-*' \
    | wc -l
)"

if [ "$COUNT" -eq 0 ]; then
    pass "working backup copies absent"
else
    fail "$COUNT working backup copies present"
fi

echo
echo "===== RESULT ====="

if [ "$FAIL" -eq 0 ]; then
    echo "A8_CANONICAL_REPO_GUARD=PASS"
    exit 0
fi

echo "A8_CANONICAL_REPO_GUARD=FAIL"
exit 1
