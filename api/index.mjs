// Vercel serverless entry (plain JS — avoids Vercel's TypeScript type-checking
// of the @workspace/* source tree).
// The Express app is pre-bundled by scripts/vercel-build.sh into a
// self-contained .mjs; the sibling pino worker files are co-located in the
// same directory and included via the functions.includeFiles config.
import app from "../artifacts/api-server/dist/vercel/vercel.mjs";

export default app;
