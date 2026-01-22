import type { SourceRow } from "../db/source-client.js";

export interface TransformResult {
  status: "success" | "failure";
  schemaKey: string;
  rowsProcessed: number;
  rowsUpserted: number;
  durationMs: number;
  error?: string;
}

export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number];
}

export interface TransformedRow {
  sourceSchema: string;
  sourceKey: string;
  sourceFidn: number;
  sourceObjectType: string;
  scaleBand: string;
  geom: GeoJSONPoint;
  structureType: string;
  markCategory: string;
  lateralSide: string | null;
  name: string | null;
  shape: string | null;
  colors: string[] | null;
  colorPattern: string | null;
  topmarkShape: string | null;
  topmarkColor: string | null;
  hasLight: boolean;
  lightCharacteristic: string | null;
  lightColor: string | null;
  lightRangeNm: string | null;
  lightElevationM: string | null;
  properties: Record<string, unknown>;
}

export type Transformer = (
  schemaKey: string,
  rows: SourceRow[],
) => Promise<TransformedRow[]>;

// S-57 Color codes (COLOUR attribute)
export const S57_COLORS: Record<string, string> = {
  "1": "white",
  "2": "black",
  "3": "red",
  "4": "green",
  "5": "blue",
  "6": "yellow",
  "7": "grey",
  "8": "brown",
  "9": "amber",
  "10": "violet",
  "11": "orange",
  "12": "magenta",
  "13": "pink",
};

// S-57 Buoy Shape codes (BOYSHP attribute)
export const S57_BUOY_SHAPES: Record<string, string> = {
  "1": "conical",
  "2": "can",
  "3": "spherical",
  "4": "pillar",
  "5": "spar",
  "6": "barrel",
  "7": "super-buoy",
  "8": "ice buoy",
};

// S-57 Beacon Shape codes (BCNSHP attribute)
export const S57_BEACON_SHAPES: Record<string, string> = {
  "1": "stake",
  "2": "withy",
  "3": "beacon tower",
  "4": "lattice beacon",
  "5": "pile beacon",
  "6": "cairn",
  "7": "buoyant beacon",
};

// S-57 Lateral Category codes (CATLAM attribute)
export const S57_LATERAL_CATEGORIES: Record<string, string> = {
  "1": "port",
  "2": "starboard",
  "3": "preferred_channel_starboard",
  "4": "preferred_channel_port",
};

// S-57 Cardinal Category codes (CATCAM attribute)
export const S57_CARDINAL_CATEGORIES: Record<string, string> = {
  "1": "north",
  "2": "east",
  "3": "south",
  "4": "west",
};

// S-57 Color Pattern codes (COLPAT attribute)
export const S57_COLOR_PATTERNS: Record<string, string> = {
  "1": "horizontal",
  "2": "vertical",
  "3": "diagonal",
  "4": "squared",
  "5": "stripes",
  "6": "border",
};

// S-57 Topmark Shape codes (TOPSHP attribute)
export const S57_TOPMARK_SHAPES: Record<string, string> = {
  "1": "cone, point up",
  "2": "cone, point down",
  "3": "sphere",
  "4": "2 spheres",
  "5": "cylinder",
  "6": "board",
  "7": "x-shape",
  "8": "upright cross",
  "9": "cube, point up",
  "10": "2 cones, point to point",
  "11": "2 cones, base to base",
  "12": "rhombus",
  "13": "2 cones, points upward",
  "14": "2 cones, points downward",
  "15": "besom, point up",
  "16": "besom, point down",
  "17": "flag",
  "18": "sphere over rhombus",
  "19": "square",
};

/**
 * Parse S-57 color codes from a comma-separated string to text array.
 * Input format: "3,6" or "3" (color codes)
 * Output format: ["red", "yellow"]
 */
export function parseColors(colourStr: string | null): string[] | null {
  if (!colourStr) return null;

  const codes = colourStr.split(",").map((c) => c.trim());
  const colors = codes
    .map((code) => S57_COLORS[code])
    .filter((color): color is string => color !== undefined);

  return colors.length > 0 ? colors : null;
}

/**
 * Map a single S-57 code to its text value.
 */
export function mapS57Code(
  code: string | null,
  mapping: Record<string, string>,
): string | null {
  if (!code) return null;
  return mapping[code] ?? null;
}

/**
 * Extract scale band from schema key.
 * Format: category__objecttype__scale (e.g., navigation_aids__boylat__harbor)
 */
export function extractScaleBand(schemaKey: string): string {
  const parts = schemaKey.split("__");
  return parts[2] ?? "unknown";
}

/**
 * Extract object type from schema key.
 * Format: category__objecttype__scale (e.g., navigation_aids__boylat__harbor)
 */
export function extractObjectType(schemaKey: string): string {
  const parts = schemaKey.split("__");
  return parts[1]?.toUpperCase() ?? "UNKNOWN";
}

/**
 * Build the properties JSONB object from source row, including all non-null fields.
 */
export function buildProperties(row: SourceRow): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const excludeKeys = new Set(["pk", "shape", "geojson"]);

  for (const [key, value] of Object.entries(row)) {
    if (!excludeKeys.has(key) && value !== null && value !== undefined) {
      properties[key] = value;
    }
  }

  return properties;
}
