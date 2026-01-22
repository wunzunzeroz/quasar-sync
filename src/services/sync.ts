import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Repository, SyncResult, SyncSummary } from "../domain/types.js";
import { cloneRepository, createWorkingCopy, dropSchema } from "./kart.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const TEMP_BASE = join(tmpdir(), "kart-sync");

/**
 * Builds the PostgreSQL working copy URL with schema appended.
 * Input:  postgresql://user:pass@host:5432/dbname (or postgres://)
 * Output: postgresql://user:pass@host:5432/dbname/schema_name
 */
function buildWorkingCopyUrl(schema: string): string {
  let baseUrl = env.DATABASE_URL.replace(/\/$/, ""); // Remove trailing slash if present

  // Kart requires postgresql:// not postgres://
  if (baseUrl.startsWith("postgres://")) {
    baseUrl = baseUrl.replace("postgres://", "postgresql://");
  }

  return `${baseUrl}/${schema}`;
}

/**
 * Sanitizes a repository name for use as a directory name.
 */
function sanitizeForPath(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

/**
 * Syncs a single repository to PostGIS.
 */
async function syncRepository(repo: Repository): Promise<SyncResult> {
  const startTime = Date.now();
  const repoLogger = logger.child({
    name: repo.name,
    category: repo.category,
    scale: repo.scale,
  });

  repoLogger.info("Starting sync");

  const tempDir = join(TEMP_BASE, sanitizeForPath(repo.name));

  try {
    // Clean up any existing temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    mkdirSync(tempDir, { recursive: true });

    // Drop schema before sync (Kart expects non-existent or empty schema)
    repoLogger.info({ schema: repo.key }, "Dropping existing schema");
    await dropSchema(repo.key);

    // Clone the repository
    repoLogger.info("Cloning repository");
    await cloneRepository(repo.url, tempDir);

    // Create working copy
    const workingCopyUrl = buildWorkingCopyUrl(repo.key);
    repoLogger.info({ schema: repo.key }, "Creating PostGIS working copy");
    await createWorkingCopy(tempDir, workingCopyUrl);

    const durationMs = Date.now() - startTime;
    repoLogger.info({ durationMs, schema: repo.key }, "Sync completed successfully");

    return {
      status: "success",
      repository: repo,
      schema: repo.key,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const error = err instanceof Error ? err : new Error(String(err));

    repoLogger.error({ err: error, durationMs }, "Sync failed");

    return {
      status: "failure",
      repository: repo,
      error,
      durationMs,
    };
  } finally {
    // Cleanup temp directory
    try {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      repoLogger.warn("Failed to clean up temp directory");
    }
  }
}

/**
 * Syncs all repositories, collecting results.
 * Continues on failure, reporting all results at the end.
 */
export async function syncAll(repositories: Repository[]): Promise<SyncSummary> {
  logger.info({ count: repositories.length }, "Starting sync for all repositories");

  // Ensure base temp directory exists
  if (!existsSync(TEMP_BASE)) {
    mkdirSync(TEMP_BASE, { recursive: true });
  }

  const results: SyncResult[] = [];

  for (const repo of repositories) {
    const result = await syncRepository(repo);
    results.push(result);
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failure").length;

  return {
    total: repositories.length,
    succeeded,
    failed,
    results,
  };
}
