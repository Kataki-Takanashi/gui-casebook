#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22.13 or newer from https://nodejs.org/en/download, then launch again.'
  exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=13?0:1)'; then
  echo 'Node.js 22.13 or newer is required.'
  exit 1
fi
exec node server.mjs --open
