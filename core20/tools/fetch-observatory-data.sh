#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-../a8_data}"
mkdir -p "$ROOT/originals/nsdb/phemu21" "$ROOT/originals/vizier"
echo "A8 observational source collector"
echo "Destination: $ROOT"
echo "Existing originals are never overwritten."

fetch_once(){
  local url="$1" dest="$2"
  if [[ -e "$dest" ]]; then echo "KEEP existing: $dest"; return; fi
  echo "GET $dest"
  curl -fL --retry 3 --retry-delay 2 "$url" -o "$dest"
}

fetch_once \
"https://nsdb.imcce.fr/obsphe/obsphe-en/Jmu/phemu21-data/light-curves-points/all-phemu21-compressed.zip" \
"$ROOT/originals/nsdb/phemu21/all-phemu21-compressed.zip"

for CAT in "J/other/SoSyR/50.344" "J/other/SoSyR/52.312" "J/other/SoSyR/53.368"; do
  SAFE="${CAT//\//_}"
  fetch_once \
  "https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=${CAT}&-out.all=1&-out.max=unlimited" \
  "$ROOT/originals/vizier/${SAFE}.tsv"
done

(
 cd "$ROOT"
 find originals -type f -print0 | sort -z | xargs -0 sha256sum
) | tee "$ROOT/SHA256SUMS.txt"

echo "Done."
