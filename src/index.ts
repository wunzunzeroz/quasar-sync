import { loadRepositories } from "./config/repos.js";
import { setupSshKey } from "./services/ssh.js";
import { syncAll } from "./services/sync.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Quasar-sync starting");

  try {
    // Setup SSH authentication
    await setupSshKey();

    // Load repository configuration
    const repositories = loadRepositories();
    logger.info({ count: repositories.length }, "Loaded repository configuration");

    // Run sync
    const summary = syncAll(repositories);

    // Log summary
    logger.info(
      {
        total: (await summary).total,
        succeeded: (await summary).succeeded,
        failed: (await summary).failed,
      },
      "Sync completed",
    );

    // Log individual failures for visibility
    for (const result of (await summary).results) {
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

    // Exit with error code if any failures
    if ((await summary).failed > 0) {
      logger.error("Exiting with error due to sync failures");
      process.exit(1);
    }

    logger.info("Quasar-sync completed successfully");
  } catch (err) {
    logger.fatal({ err }, "Fatal error during sync");
    process.exit(1);
  }
}

main();
