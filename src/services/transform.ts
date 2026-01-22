import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { navigationAids } from "../db/schema.js";
import { querySourceSchema } from "../db/source-client.js";
import { getTransformer, hasTransformer } from "../transformers/registry.js";
import type { TransformResult } from "../transformers/types.js";
import { logger } from "../utils/logger.js";

export interface TransformSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: TransformResult[];
}

/**
 * Transform a single schema's data from source to destination.
 */
export async function transformSchema(schemaKey: string): Promise<TransformResult> {
  const startTime = Date.now();

  if (!hasTransformer(schemaKey)) {
    logger.warn({ schemaKey }, "No transformer registered for schema, skipping");
    return {
      status: "failure",
      schemaKey,
      rowsProcessed: 0,
      rowsUpserted: 0,
      durationMs: Date.now() - startTime,
      error: "No transformer registered",
    };
  }

  const transformer = getTransformer(schemaKey)!;

  try {
    logger.info({ schemaKey }, "Starting transformation");

    // Query source data
    const sourceRows = await querySourceSchema(schemaKey);
    logger.debug({ schemaKey, rowCount: sourceRows.length }, "Fetched source rows");

    if (sourceRows.length === 0) {
      logger.warn({ schemaKey }, "No rows found in source schema");
      return {
        status: "success",
        schemaKey,
        rowsProcessed: 0,
        rowsUpserted: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Transform rows
    const transformedRows = await transformer(schemaKey, sourceRows);
    logger.debug(
      { schemaKey, transformedCount: transformedRows.length },
      "Transformed rows",
    );

    // Upsert to destination
    let upsertedCount = 0;
    for (const row of transformedRows) {
      await db
        .insert(navigationAids)
        .values({
          ...row,
          geom: sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(row.geom)}), 4326)`,
        })
        .onConflictDoUpdate({
          target: navigationAids.sourceKey,
          set: {
            sourceSchema: row.sourceSchema,
            sourceFidn: row.sourceFidn,
            sourceObjectType: row.sourceObjectType,
            scaleBand: row.scaleBand,
            geom: sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(row.geom)}), 4326)`,
            structureType: row.structureType,
            markCategory: row.markCategory,
            lateralSide: row.lateralSide,
            name: row.name,
            shape: row.shape,
            colors: row.colors,
            colorPattern: row.colorPattern,
            topmarkShape: row.topmarkShape,
            topmarkColor: row.topmarkColor,
            hasLight: row.hasLight,
            lightCharacteristic: row.lightCharacteristic,
            lightColor: row.lightColor,
            lightRangeNm: row.lightRangeNm,
            lightElevationM: row.lightElevationM,
            properties: row.properties,
          },
        });
      upsertedCount++;
    }

    logger.info(
      { schemaKey, rowsProcessed: sourceRows.length, rowsUpserted: upsertedCount },
      "Transformation completed",
    );

    return {
      status: "success",
      schemaKey,
      rowsProcessed: sourceRows.length,
      rowsUpserted: upsertedCount,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ schemaKey, error: errorMessage }, "Transformation failed");

    return {
      status: "failure",
      schemaKey,
      rowsProcessed: 0,
      rowsUpserted: 0,
      durationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Transform all schemas that have registered transformers.
 * Continues on failure for individual schemas.
 */
export async function transformAll(schemaKeys: string[]): Promise<TransformSummary> {
  const results: TransformResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const schemaKey of schemaKeys) {
    if (!hasTransformer(schemaKey)) {
      logger.warn({ schemaKey }, "No transformer registered, skipping");
      skipped++;
      continue;
    }

    const result = await transformSchema(schemaKey);
    results.push(result);

    if (result.status === "success") {
      succeeded++;
    } else {
      failed++;
    }
  }

  const summary: TransformSummary = {
    total: schemaKeys.length,
    succeeded,
    failed,
    skipped,
    results,
  };

  logger.info(
    {
      total: summary.total,
      succeeded: summary.succeeded,
      failed: summary.failed,
      skipped: summary.skipped,
    },
    "Transform summary",
  );

  return summary;
}
