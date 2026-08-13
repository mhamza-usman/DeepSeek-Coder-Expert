#!/usr/bin/env bash
set -euo pipefail

COMMIT_MESSAGE="${1:-feat: incremental local update}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}[info]${NC} Staging changes..."
git add .

echo -e "${BLUE}[info]${NC} Creating commit: ${COMMIT_MESSAGE}"
if git diff --cached --quiet; then
  echo -e "${YELLOW}[warn]${NC} No staged changes to commit."
else
  git commit -m "${COMMIT_MESSAGE}"
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo -e "${BLUE}[info]${NC} Pushing to origin/main..."
  git push origin main
  echo -e "${GREEN}[success]${NC} Push complete."
else
  echo -e "${RED}[error]${NC} Remote 'origin' not found."
  exit 1
fi
