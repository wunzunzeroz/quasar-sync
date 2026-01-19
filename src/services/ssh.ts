import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { env } from "../config/env.js";
import { SshSetupError } from "../domain/errors.js";
import { logger } from "../utils/logger.js";

const SSH_DIR = join(homedir(), ".ssh");
const KNOWN_HOSTS_PATH = join(SSH_DIR, "known_hosts");

/**
 * Detects key type from the decoded private key content.
 * Returns the appropriate filename for ~/.ssh/
 */
function detectKeyFilename(keyContent: string): string {
  if (keyContent.includes("BEGIN OPENSSH PRIVATE KEY")) {
    // Modern OpenSSH format - could be ed25519 or rsa
    // Check for key type indicator in the key
    if (keyContent.includes("ssh-ed25519") || keyContent.length < 800) {
      return "id_ed25519";
    }
    return "id_rsa";
  }
  if (keyContent.includes("BEGIN RSA PRIVATE KEY")) {
    return "id_rsa";
  }
  if (keyContent.includes("BEGIN EC PRIVATE KEY")) {
    return "id_ecdsa";
  }
  // Default to ed25519
  return "id_ed25519";
}

/**
 * Sets up SSH authentication for Kart repository access.
 * - Decodes the base64-encoded private key from environment
 * - Writes it to ~/.ssh/ with appropriate filename
 * - Sets correct permissions
 * - Adds koordinates.com to known_hosts
 */
export async function setupSshKey(): Promise<void> {
  logger.info("Setting up SSH authentication");

  // Ensure .ssh directory exists
  if (!existsSync(SSH_DIR)) {
    mkdirSync(SSH_DIR, { mode: 0o700 });
    logger.debug("Created .ssh directory");
  }

  // Decode and write private key
  let privateKey: string;
  try {
    privateKey = Buffer.from(env.SSH_PRIVATE_KEY, "base64").toString("utf-8");
  } catch (err) {
    throw new SshSetupError("Failed to decode SSH_PRIVATE_KEY from base64");
  }

  // Validate it looks like a key
  if (!privateKey.includes("PRIVATE KEY")) {
    throw new SshSetupError(
      "SSH_PRIVATE_KEY does not appear to be a valid private key. " +
        "Make sure you base64-encoded the entire key file including headers.",
    );
  }

  // Ensure key ends with newline
  if (!privateKey.endsWith("\n")) {
    privateKey += "\n";
  }

  const keyFilename = detectKeyFilename(privateKey);
  const keyPath = join(SSH_DIR, keyFilename);

  logger.debug({ keyFilename }, "Detected key type");

  try {
    writeFileSync(keyPath, privateKey, { mode: 0o600 });
    logger.debug({ path: keyPath }, "Wrote SSH private key");
  } catch (err) {
    throw new SshSetupError(`Failed to write SSH key: ${(err as Error).message}`);
  }

  // Add data.koordinates.com to known_hosts
  try {
    const knownHost = execSync(
      "ssh-keyscan -t ed25519,rsa data.koordinates.com 2>/dev/null",
      { encoding: "utf-8" },
    );

    if (knownHost.trim()) {
      appendFileSync(KNOWN_HOSTS_PATH, knownHost);
      logger.debug("Added data.koordinates.com to known_hosts");
    }
  } catch (err) {
    logger.warn("Could not fetch host key for data.koordinates.com, continuing anyway");
  }

  logger.info("SSH authentication configured");
}
