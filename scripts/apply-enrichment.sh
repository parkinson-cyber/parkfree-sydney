#!/usr/bin/env bash
# Apply every committed (network-free) enrichment overlay onto src/data/parking.json,
# in a stable order, then normalise provenance metadata.
#
# This is the fast, offline half of the pipeline: it re-tags resident-permit and
# meter overlays from the committed scripts/data/*.json schedules. The network
# half (base OSM fetch, City of Sydney/TfNSW/Waverley open data) is run
# separately by `npm run fetch-data` + the CBD/Waverley scripts; their tagged
# features persist across incremental base fetches, so this offline pass is all
# that's needed after adding new base areas.
#
# Usage:  bash scripts/apply-enrichment.sh
set -euo pipefail
cd "$(dirname "$0")/.."

for s in northsydney woollahra ryde mosman randwick innerwest innerwest-leichhardt lanecove canadabay burwood huntershill strathfield willoughby-south; do
  echo "── $s ─────────────────────────────"
  python3 "scripts/fetch-${s}-parking.py"
done

# Randwick: area polygons (network, council ArcGIS) then per-kerb signs (offline,
# committed GeoJSON). The kerb pass upgrades polygon-tagged segments, so order matters.
echo "── northern-beaches (offline signs) ─"
python3 scripts/fetch-northernbeaches-parking.py

echo "── randwick-rps-geo (network) ───────"
python3 scripts/fetch-randwick-rps-geo.py || echo "  (council server unreachable — polygon tags kept as-is)"
echo "── randwick-kerbs ───────────────────"
python3 scripts/fetch-randwick-kerbs-parking.py

# Photographed signs run last: they are the strongest evidence for the exact
# stretch of kerb they cover, so they get the final say over schedule-derived tags.
# State roads: TfNSW signs the main roads councils don't. Runs before field
# signs so a photographed sign can still override a clearway.
echo "── tfnsw-clearways (offline) ────────"
python3 scripts/fetch-tfnsw-clearways.py

echo "── field-signs ──────────────────────"
python3 scripts/fetch-field-signs.py

echo "── finalize ─────────────────────────"
python3 scripts/finalize-metadata.py
