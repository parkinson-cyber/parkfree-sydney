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

for s in northsydney woollahra ryde mosman randwick innerwest innerwest-leichhardt lanecove canadabay burwood huntershill strathfield; do
  echo "── $s ─────────────────────────────"
  python3 "scripts/fetch-${s}-parking.py"
done

echo "── finalize ─────────────────────────"
python3 scripts/finalize-metadata.py
