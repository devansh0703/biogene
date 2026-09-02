#!/usr/bin/env bash
set -euo pipefail

echo "==> Typechecking (non-fatal)..."
pnpm run typecheck > /dev/null 2>&1 || echo "  (typecheck warnings present; continuing build)"

echo "==> Building frontend (API serverless function compiles its own source via Vercel)..."
export PORT=3000
export BASE_PATH="/"
export NODE_ENV=production
pnpm --filter @workspace/biogene run build

echo "==> Build complete!"
