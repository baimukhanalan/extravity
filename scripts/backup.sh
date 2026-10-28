#!/usr/bin/env bash
#
# Logical backup of the Postgres database via pg_dump.
#
# Neon already keeps continuous WAL for point-in-time restore (see
# docs/deployment.md), so this is the *second* line of defence: a portable,
# provider-independent dump you can restore anywhere, keep off-site, or diff.
#
# Usage:
#   DATABASE_URL="<neon-UNPOOLED-url>" ./scripts/backup.sh [output-dir]
#
# Notes:
#   * Use the UNPOOLED (direct) URL — pg_dump opens a session that pgbouncer's
#     transaction pooling does not support.
#   * The custom format (-Fc) is compressed and restores with pg_restore, which
#     lets you restore a single table or run in parallel.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Pass the Neon UNPOOLED connection string." >&2
  exit 1
fi

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/eckz-${STAMP}.dump"

echo "Dumping database to $FILE ..."
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "Done: $FILE ($SIZE)"

# Retention: keep the 14 most recent dumps, drop older ones.
KEEP=14
ls -1t "$OUT_DIR"/eckz-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "Pruning old backup: $old"
  rm -f "$old"
done

echo "Restore with:  pg_restore --clean --if-exists --no-owner -d \"<target-url>\" $FILE"
