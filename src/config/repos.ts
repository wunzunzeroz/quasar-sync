import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Repository } from "../domain/types.js";
import { ConfigError } from "../domain/errors.js";

const repositorySchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, {
      message:
        "Key must be a valid PostgreSQL identifier (lowercase, start with letter, only a-z, 0-9, _)",
    }),
  name: z.string().min(1),
  category: z.string().min(1),
  scale: z.enum(["harbor", "approach", "coastal", "general", "overview"]),
  url: z.string().min(1),
});

const configSchema = z
  .object({
    repositories: z.array(repositorySchema).min(1, "At least one repository required"),
  })
  .refine(
    (data) => {
      const keys = data.repositories.map((r) => r.key);
      return new Set(keys).size === keys.length;
    },
    { message: "Repository keys must be unique" },
  );

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

  return result.data.repositories;
}
