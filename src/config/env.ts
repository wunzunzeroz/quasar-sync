import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (url) => url.startsWith("postgresql://") || url.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL connection string",
    ),
  SSH_PRIVATE_KEY: z
    .string()
    .min(1, "SSH_PRIVATE_KEY is required (base64-encoded)"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .optional()
    .default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
