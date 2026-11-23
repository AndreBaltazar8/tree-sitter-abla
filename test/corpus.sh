#!/bin/sh
# Parses every .ab file of an ablac checkout (stdlib, src, tests/cases) and fails on a file whose tree has an
# ERROR or MISSING node, unless test/known-gaps.txt (paths relative to the checkout) lists it.
# Usage: sh test/corpus.sh /path/to/ablac
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
ablac=${1:?usage: corpus.sh /path/to/ablac}
list=$(mktemp)
config=$(mktemp)
trap 'rm -f "$list" "$config"' EXIT
parsers=$(mktemp -d)
trap 'rm -rf "$parsers"; rm -f "$list" "$config"' EXIT
ln -s "$root" "$parsers/tree-sitter-abla"
printf '{ "parser-directories": ["%s"] }\n' "$parsers" > "$config"
(cd "$ablac" && find stdlib src tests/cases -name '*.ab' | sort) > "$list.rel"
sed "s|^|$ablac/|" "$list.rel" > "$list"
rm -f "$list.rel"
total=$(wc -l < "$list")
cd "$root"
failed=$(mktemp)
tree-sitter parse --config-path "$config" --paths "$list" -q 2>&1 | grep -E '\(ERROR|MISSING' | awk '{print $1}' | sort -u > "$failed" || true
# a known gap is listed relative to the checkout
unknown=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  relative=${file#"$ablac"/}
  if ! grep -qxF "$relative" test/known-gaps.txt 2>/dev/null; then
    echo "ERROR nodes: $relative" >&2
    unknown=$((unknown + 1))
  fi
done < "$failed"
rm -f "$failed"
echo "tree-sitter-abla corpus: $total files, $unknown with ERROR nodes outside test/known-gaps.txt"
[ "$unknown" -eq 0 ]
