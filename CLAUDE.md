# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quasar-sync is a Kart repository synchronization service that clones Kart repositories and pushes data to a PostGIS database. It's designed to run as a Dockerized service on Railway, triggered by cron jobs.

**Key concepts:**
- Syncs Kart repositories (geospatial version control) to PostGIS
- Each repo gets its own Kart-managed schema (e.g., `buoy_lateral_points_hydro_14k_122k`)
- No data transformation - raw data only; normalization happens in a separate app
- Example Kart URL format: `kart@data.koordinates.com:linz/buoy-lateral-points-hydro-14k-122k`

## Commands

```bash
npm run dev        # Run with tsx (development)
npm run build      # Build with tsup
npm run start      # Run built output
npm run typecheck  # Type check without emit
npm run lint       # ESLint
npm run format     # Prettier
```

## Architecture

```
src/
├── index.ts              # Entry point - orchestrates sync
├── config/
│   ├── env.ts            # Zod-validated environment variables
│   └── repos.ts          # YAML config loader
├── domain/
│   ├── types.ts          # Core types (Repository, SyncResult)
│   └── errors.ts         # Custom error types
├── services/
│   ├── kart.ts           # Kart CLI wrapper (clone, create-workingcopy)
│   ├── sync.ts           # Sync orchestrator
│   └── ssh.ts            # SSH key setup from env
└── utils/
    └── logger.ts         # Pino logger
```

**Sync flow:**
1. Setup SSH key from `SSH_PRIVATE_KEY` env var
2. Load repos from `repos.yaml`
3. For each repo: clone → create PostGIS working copy → cleanup temp dir
4. Report summary; exit 1 if any failures

## Configuration

- `repos.yaml`: List of repositories to sync (name, category, url, optional schema override)
- Environment variables: `DATABASE_URL`, `SSH_PRIVATE_KEY`, `LOG_LEVEL`

## Tech Stack

- **Runtime**: Node.js with TypeScript (ES2023, NodeNext modules)
- **Database**: PostgreSQL/PostGIS (Kart manages schemas directly)
- **Validation**: Zod
- **Logging**: Pino
- **Build**: tsup

## TypeScript Configuration

Strict mode with additional safety checks:
- `noUncheckedIndexedAccess`: Array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes`: Optional properties must match exact type

## Code Style

Prettier: double quotes, semicolons, 2-space indent, 90 char width, trailing commas
