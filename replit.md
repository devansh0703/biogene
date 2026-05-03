# BioForge — Unified Bioinformatics Platform

## Overview

BioForge is a full-stack bioinformatics web application with 8 scientific modules, all powered by real external APIs. Monochrome black/white neobrutalist UI.

## Architecture

- **Frontend**: React + Vite (`artifacts/bioforge`) — preview at `/`
- **Backend**: Express 5 API server (`artifacts/api-server`) — at `/api`
- **Database**: PostgreSQL + Drizzle ORM (`lib/db`)
- **OpenAPI spec**: `lib/api-spec/openapi.yaml` → codegen via Orval
- **React Query hooks**: `lib/api-client-react/src/generated/api.ts`
- **Zod schemas**: `lib/api-zod/src/generated/api.ts`

## Modules & External APIs

| Module | Route | API |
|---|---|---|
| Dashboard | `/` | Aggregated stats |
| Variant Analysis | `/genomics` | Ensembl VEP + NCBI ClinVar |
| Protein Structure | `/protein` | RCSB PDB + PDBe + UniProt |
| CRISPR Design | `/crispr` | Ensembl REST (gene sequences) |
| Biomedical NLP | `/nlp` | PubTator3 + NCBI E-utils |
| Genome Browser | `/genome` | Ensembl REST |
| Lab Management | `/lims` | PostgreSQL (full CRUD) |
| Drug Discovery | `/drugs` | ChEMBL REST |
| RNA-Seq | `/transcriptomics` | GTEx Portal API v2 |

## 3D Visualizations

- **Protein Viewer**: NGL viewer (dynamic import) — CIF files from RCSB PDB
- **Knowledge Graph**: React Three Fiber — 3D force-directed graph (entities + relations)
- **Genome Browser**: React Three Fiber — 3D lollipop chromosome view
- **Drug Molecule**: React Three Fiber — SMILES-parsed atom/bond 3D rendering

## Database Tables

- `genomics_jobs`, `variants` — VCF upload and variant annotation
- `crispr_jobs`, `guide_rnas` — CRISPR guide RNA design
- `samples`, `experiments` — LIMS sample/experiment management
- `nlp_entities`, `nlp_relations` — Extracted biomedical entities
- `transcriptomics_jobs` — RNA-Seq pipeline jobs

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **3D**: React Three Fiber + drei + NGL
- **Charts**: Recharts

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Design Principles

- Pure black (#000000) background, white text, monochrome only
- No color except clinical significance (red/green) and expression heatmaps
- Monospace font for data, sans-serif for UI labels
- Neobrutalist aesthetic: no rounded corners, clean borders, dense information
- No emojis, no placeholders, all data from real external APIs

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
