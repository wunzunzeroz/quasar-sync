import postgres from "postgres";
import { env } from "../config/env.js";

export const sourceDb = postgres(env.DATABASE_URL);

export interface SourceRow {
  pk: string;
  fidn: string;
  shape: unknown;
  objnam: string | null;
  colour: string | null;
  colpat: string | null;
  boyshp: string | null;
  bcnshp: string | null;
  catlam: string | null;
  catcam: string | null;
  marsys: string | null;
  status: string | null;
  inform: string | null;
  ninfom: string | null;
  natcon: string | null;
  conrad: string | null;
  veracc: number | null;
  verlen: number | null;
  scamin: number | null;
  datsta: string | null;
  datend: string | null;
  persta: string | null;
  perend: string | null;
  sordat: string | null;
  sorind: string | null;
  picrep: string | null;
  txtdsc: string | null;
  ntxtds: string | null;
  nobjnm: string | null;
  [key: string]: unknown;
}

export async function querySourceSchema(schemaName: string): Promise<SourceRow[]> {
  const tables = await sourceDb`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ${schemaName}
    AND table_type = 'BASE TABLE'
    AND table_name NOT LIKE '_kart%'
  `;

  if (tables.length === 0) {
    return [];
  }

  const allRows: SourceRow[] = [];
  for (const table of tables) {
    const tableName = table.table_name as string;
    const rows = await sourceDb`
      SELECT *, ST_AsGeoJSON(shape)::jsonb as geojson
      FROM ${sourceDb(schemaName)}.${sourceDb(tableName)}
    `;
    allRows.push(...(rows as unknown as SourceRow[]));
  }

  return allRows;
}
