import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Repository } from "../domain/types.js";
import { ConfigError } from "../domain/errors.js";

const repositorySchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  url: z.string().min(1),
  schema: z.string().optional(),
});

const configSchema = z.object({
  repositories: z.array(repositorySchema).min(1, "At least one repository required"),
});

/**
 * Extracts schema name from Kart URL.
 * Example: kart@data.koordinates.com:linz/buoy-lateral-points-hydro-14k-122k
 * Returns: buoy_lateral_points_hydro_14k_122k
 */
export function deriveSchemaName(url: string): string {
  // Extract the path after the colon (e.g., "linz/buoy-lateral-points-hydro-14k-122k")
  const colonIndex = url.lastIndexOf(":");
  if (colonIndex === -1) {
    throw new ConfigError(`Invalid Kart URL format: ${url}`);
  }

  const path = url.slice(colonIndex + 1);

  // Take the last segment (after the final slash)
  const segments = path.split("/");
  const lastSegment = segments[segments.length - 1];

  if (!lastSegment) {
    throw new ConfigError(`Could not derive schema name from URL: ${url}`);
  }

  // Sanitize: replace hyphens with underscores, lowercase
  return lastSegment.replace(/-/g, "_").toLowerCase();
}

export function loadRepositories(configPath?: string): Repository[] {
  const path = configPath ?? resolve(process.cwd(), "repos.yaml");

  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch (err) {
    throw new ConfigError(`Failed to read config file: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (err) {
    throw new ConfigError(`Failed to parse YAML: ${(err as Error).message}`);
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`Invalid config: ${result.error.message}`);
  }

  return result.data.repositories.map((repo) => ({
    ...repo,
    schema: repo.schema ?? deriveSchemaName(repo.url),
  }));
}
