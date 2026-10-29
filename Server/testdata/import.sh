#!/usr/bin/env bash
# Import the test dataset with the MongoDB database tools (no Node needed).
#   MONGODB_URI="mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/ecommerce" ./testdata/import.sh [--drop]
# The URI must contain the database name. --drop replaces the existing documents of these collections.
set -euo pipefail
cd "$(dirname "$0")"
: "${MONGODB_URI:?set MONGODB_URI (with the database name)}"
command -v mongoimport >/dev/null || { echo "mongoimport not found — install MongoDB Database Tools or use: npm run testdata:import" >&2; exit 1; }
DROP=""; [ "${1:-}" = "--drop" ] && DROP="--drop"
for c in users categories brands products carts orders reviews activitylogs; do
  echo "→ $c"
  mongoimport --uri="$MONGODB_URI" --collection="$c" --file="$c.json" --jsonArray $DROP --quiet
done
echo "Done. Copy testdata/uploads/* into your API's uploads folder to show the product images."
