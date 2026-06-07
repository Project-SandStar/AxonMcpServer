#!/bin/bash
# Compile the VSCode extension with version bump
# Usage: ./scripts/compile.sh

set -e
cd "$(dirname "$0")/.."

echo "=== Bumping version ==="
npm run bump

echo ""
echo "=== Compiling ==="
npm run compile

echo ""
echo "=== Done ==="
