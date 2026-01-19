import { createServer } from "node:http";
import { loadRepositories } from "./config/repos.js";
import { setupSshKey } from "./services/ssh.js";
import { syncAll } from "./services/sync.js";
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

    const summary = await syncAll(repositories);

    logger.info(
      {
        total: summary.total,
        succeeded: summary.succeeded,
        failed: summary.failed,
      },
      "Sync completed",
    );

    for (const result of summary.results) {
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

    return {
      success: summary.failed === 0,
      summary: {
        total: summary.total,
        succeeded: summary.succeeded,
        failed: summary.failed,
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
