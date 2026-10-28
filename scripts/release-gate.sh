#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

before_manifest="$(mktemp)"
after_manifest="$(mktemp)"
cleanup() {
  unlink "$before_manifest" 2>/dev/null || true
  unlink "$after_manifest" 2>/dev/null || true
}
trap cleanup EXIT

source_manifest() {
  {
    find app components lib prisma e2e apps/parser \
      -type f \
      ! -path '*/node_modules/*' \
      ! -path '*/__pycache__/*' \
      ! -path '*/.pytest_cache/*' \
      ! -path '*/.state/*' \
      ! -name '*.pyc' \
      -print
    find . -maxdepth 1 -type f \
      \( -name 'package.json' -o -name 'package-lock.json' -o -name 'tsconfig.json' \
         -o -name 'next.config.*' -o -name 'playwright.config.ts' -o -name 'vitest.config.*' \
         -o -name 'eslint.config.*' \) -print
  } | LC_ALL=C sort | while IFS= read -r path; do
    shasum -a 256 "$path"
  done
}

source_manifest > "$before_manifest"
release_fingerprint="$(shasum -a 256 "$before_manifest" | awk '{print $1}')"
echo "Release source fingerprint: $release_fingerprint"

echo "[1/6] TypeScript"
npx tsc --noEmit

echo "[2/6] ESLint"
npm run lint

echo "[3/6] Web unit tests"
npm test -- --run

echo "[4/6] Parser tests"
(cd apps/parser && python -m pytest tests -q)

echo "[5/6] Production build"
npm run build

echo "[6/6] Playwright E2E"
if [[ -z "${E2E_DATABASE_URL:-}" ]]; then
  echo "E2E_DATABASE_URL is required for a production-ready release gate." >&2
  echo "Use only a dedicated local database whose name contains e2e or test." >&2
  exit 2
fi
npm run e2e

source_manifest > "$after_manifest"
if ! cmp -s "$before_manifest" "$after_manifest"; then
  echo "Source changed while the release gate was running; results are not a stable release snapshot." >&2
  diff -u "$before_manifest" "$after_manifest" || true
  exit 3
fi

echo "Release gate passed for source fingerprint: $release_fingerprint"
