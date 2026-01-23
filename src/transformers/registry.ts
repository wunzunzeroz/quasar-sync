import type { Transformer } from "./types.js";
import { bcnlatTransformer } from "./bcnlat.js";
import { boylatTransformer } from "./boylat.js";

/**
 * Registry mapping schema keys to their transformer functions.
 * Schemas not in this registry will be skipped during transformation.
 */
const transformerRegistry: Record<string, Transformer> = {
  // Lateral Beacons - all scales use the same transformer
  navigation_aids__bcnlat__harbor: bcnlatTransformer,
  navigation_aids__bcnlat__approach: bcnlatTransformer,
  navigation_aids__bcnlat__coastal: bcnlatTransformer,
  // Lateral Buoys - all scales use the same transformer
  navigation_aids__boylat__harbor: boylatTransformer,
  navigation_aids__boylat__approach: boylatTransformer,
  navigation_aids__boylat__coastal: boylatTransformer,
};

/**
 * Get the transformer function for a schema key.
 * Returns undefined if no transformer is registered for the schema.
 */
export function getTransformer(schemaKey: string): Transformer | undefined {
  return transformerRegistry[schemaKey];
}

/**
 * Check if a transformer is registered for a schema key.
 */
export function hasTransformer(schemaKey: string): boolean {
  return schemaKey in transformerRegistry;
}

/**
 * Get all registered schema keys.
 */
export function getRegisteredSchemas(): string[] {
  return Object.keys(transformerRegistry);
}
