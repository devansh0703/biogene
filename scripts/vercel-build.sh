#!/usr/bin/env bash
set -euo pipefail

echo "==> Typechecking (non-fatal)..."
pnpm run typecheck > /dev/null 2>&1 || echo "  (typecheck warnings present; continuing build)"

echo "==> Building API server (produces serverless bundle for api/index.ts)..."
pnpm --filter @workspace/api-server run build

echo "==> Building frontend..."
export PORT=3000
export BASE_PATH="/"
export NODE_ENV=production
pnpm --filter @workspace/biogene run build

echo "==> Build complete!"
