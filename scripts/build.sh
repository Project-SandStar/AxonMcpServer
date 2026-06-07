#!/bin/bash
# Build script for Axon MCP Server
# Usage: ./scripts/build.sh [--clean] [--watch]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
CLEAN=false
WATCH=false

for arg in "$@"; do
    case $arg in
        --clean)
            CLEAN=true
            shift
            ;;
        --watch)
            WATCH=true
            shift
            ;;
        --help|-h)
            echo "Usage: ./scripts/build.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --clean    Remove dist/ directory before building"
            echo "  --watch    Watch mode - rebuild on file changes"
            echo "  --help     Show this help message"
            exit 0
            ;;
    esac
done

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Axon MCP Server Build                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Clean if requested
if [ "$CLEAN" = true ]; then
    echo -e "${YELLOW}Cleaning dist/ directory...${NC}"
    rm -rf dist/
    echo -e "${GREEN}✓ Clean complete${NC}"
    echo ""
fi

# Check for node_modules
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
fi

# Build
if [ "$WATCH" = true ]; then
    echo -e "${BLUE}Starting watch mode...${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""
    npx tsc --watch
else
    echo -e "${BLUE}Building TypeScript...${NC}"
    START_TIME=$(date +%s)

    if npx tsc; then
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        echo ""
        echo -e "${GREEN}✓ Build successful in ${DURATION}s${NC}"

        # Show output info
        if [ -d "dist" ]; then
            FILE_COUNT=$(find dist -name "*.js" | wc -l | tr -d ' ')
            echo -e "${GREEN}✓ Generated ${FILE_COUNT} JavaScript files in dist/${NC}"
        fi
    else
        echo ""
        echo -e "${RED}✗ Build failed${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}Done!${NC}"
