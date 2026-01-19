import { spawn } from "node:child_process";
import { KartError } from "../domain/errors.js";
import { logger } from "../utils/logger.js";

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function execKart(args: string[], cwd?: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("kart", args, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      reject(
        new KartError(`Failed to spawn kart: ${err.message}`, args.join(" "), null, ""),
      );
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

/**
 * Clones a Kart repository to a local directory.
 */
export async function cloneRepository(url: string, localPath: string): Promise<void> {
  logger.debug({ url, localPath }, "Cloning Kart repository");

  const result = await execKart(["clone", url, localPath]);

  if (result.exitCode !== 0) {
    throw new KartError(
      `Failed to clone repository: ${url}`,
      `kart clone ${url} ${localPath}`,
      result.exitCode,
      result.stderr,
    );
  }

  logger.debug({ url, localPath }, "Clone completed");
}

/**
 * Creates a PostgreSQL working copy for a cloned Kart repository.
 * The working copy URL should include the schema name.
 * Example: postgresql://user:pass@host:5432/dbname/schema_name
 */
export async function createWorkingCopy(
  repoPath: string,
  postgresUrl: string,
): Promise<void> {
  logger.debug(
    { repoPath, postgresUrl: postgresUrl.replace(/:[^:@]+@/, ":***@") },
    "Creating working copy",
  );

  const result = await execKart(
    ["create-workingcopy", "--delete-existing", postgresUrl],
    repoPath,
  );

  if (result.exitCode !== 0) {
    throw new KartError(
      `Failed to create working copy`,
      `kart create-workingcopy ${postgresUrl.replace(/:[^:@]+@/, ":***@")}`,
      result.exitCode,
      result.stderr,
    );
  }

  logger.debug({ repoPath }, "Working copy created");
}
