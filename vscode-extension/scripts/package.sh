#!/bin/bash
# Package the VSCode extension into a .vsix file
# Note: This runs vscode:prepublish which bumps version and compiles
# Usage: ./scripts/package.sh

set -e
cd "$(dirname "$0")/.."

echo "=== Packaging VSCode Extension ==="
npx vsce package --allow-missing-repository

echo ""
echo "=== Done ==="
ls -la *.vsix 2>/dev/null | tail -1
