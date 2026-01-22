import { createServer } from "node:http";
import { loadRepositories } from "./config/repos.js";
import { setupSshKey } from "./services/ssh.js";
import { syncAll } from "./services/sync.js";
import { transformAll } from "./services/transform.js";
import { logger } from "./utils/logger.js";

let isSyncing = false;

async function runSync(): Promise<{ success: boolean; summary: unknown }> {
  if (isSyncing) {
    return { success: false, summary: { error: "Sync already in progress" } };
  }

  isSyncing = true;

  try {
    const repositories = loadRepositories();
    logger.info({ count: repositories.length }, "Starting sync");

    // Step 1: Sync all repositories
    const syncSummary = await syncAll(repositories);

    logger.info(
      {
        total: syncSummary.total,
        succeeded: syncSummary.succeeded,
        failed: syncSummary.failed,
      },
      "Sync completed",
    );

    for (const result of syncSummary.results) {
      if (result.status === "failure") {
        logger.error(
          {
            name: result.repository.name,
            category: result.repository.category,
            error: result.error.message,
          },
          "Repository sync failed",
        );
      }
    }

    // Step 2: Transform synced data to destination database
    const schemaKeys = repositories.map((r) => r.key);
    logger.info({ count: schemaKeys.length }, "Starting transform");

    const transformSummary = await transformAll(schemaKeys);

    logger.info(
      {
        total: transformSummary.total,
        succeeded: transformSummary.succeeded,
        failed: transformSummary.failed,
        skipped: transformSummary.skipped,
      },
      "Transform completed",
    );

    return {
      success: syncSummary.failed === 0 && transformSummary.failed === 0,
      summary: {
        sync: {
          total: syncSummary.total,
          succeeded: syncSummary.succeeded,
          failed: syncSummary.failed,
        },
        transform: {
          total: transformSummary.total,
          succeeded: transformSummary.succeeded,
          failed: transformSummary.failed,
          skipped: transformSummary.skipped,
        },
      },
    };
  } finally {
    isSyncing = false;
  }
}

async function main(): Promise<void> {
  logger.info("Quasar-sync starting");

  // Setup SSH authentication on startup
  await setupSshKey();

  const port = process.env.PORT ?? 3000;

  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/run") {
      logger.info("Received /run request");

      try {
        const result = await runSync();

        res.writeHead(result.success ? 200 : 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.summary));
      } catch (err) {
        logger.error({ err }, "Sync failed");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    } else if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", syncing: isSyncing }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal error during startup");
  process.exit(1);
});
