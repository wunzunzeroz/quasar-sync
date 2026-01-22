import type { SourceRow } from "../db/source-client.js";
import type { TransformedRow } from "./types.js";
import {
  parseColors,
  mapS57Code,
  extractScaleBand,
  extractObjectType,
  buildProperties,
  S57_BUOY_SHAPES,
  S57_LATERAL_CATEGORIES,
  S57_COLOR_PATTERNS,
} from "./types.js";

/**
 * Transform BOYLAT (Buoy Lateral) S-57 data to normalized navigation_aids format.
 */
export async function boylatTransformer(
  schemaKey: string,
  rows: SourceRow[],
): Promise<TransformedRow[]> {
  const scaleBand = extractScaleBand(schemaKey);
  const objectType = extractObjectType(schemaKey);

  return rows.map((row) => {
    const geojson = row.geojson as { coordinates: [number, number] } | null;
    if (!geojson?.coordinates) {
      throw new Error(`Missing geometry for row with fidn: ${row.fidn}`);
    }

    const [lng, lat] = geojson.coordinates;

    return {
      sourceSchema: schemaKey,
      sourceKey: `${schemaKey}:${row.fidn}`,
      sourceFidn: parseInt(row.fidn, 10),
      sourceObjectType: objectType,
      scaleBand,
      geom: { type: "Point" as const, coordinates: [lng, lat] as [number, number] },
      structureType: "buoy",
      markCategory: "lateral",
      lateralSide: mapS57Code(row.catlam, S57_LATERAL_CATEGORIES),
      name: row.objnam,
      shape: mapS57Code(row.boyshp, S57_BUOY_SHAPES),
      colors: parseColors(row.colour),
      colorPattern: mapS57Code(row.colpat, S57_COLOR_PATTERNS),
      topmarkShape: null,
      topmarkColor: null,
      hasLight: false,
      lightCharacteristic: null,
      lightColor: null,
      lightRangeNm: null,
      lightElevationM: null,
      properties: buildProperties(row),
    };
  });
}
