// Vercel serverless entry.
// Imports the Express app from source. Vercel bundles this (including the
// @workspace/* packages) with its own esbuild-based builder when it compiles
// the api/ directory into a serverless function.
import app from "../artifacts/api-server/src/app";

export default function handler(req: any, res: any) {
  return app(req, res);
}
