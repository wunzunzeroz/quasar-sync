import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  jsonb,
  geometry,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const navigationAids = pgTable(
  "navigation_aids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceSchema: text("source_schema").notNull(),
    sourceKey: text("source_key").notNull(),
    sourceFidn: integer("source_fidn").notNull(),
    sourceObjectType: text("source_object_type").notNull(),
    scaleBand: text("scale_band").notNull(),
    geom: geometry("geom", { type: "point", srid: 4326 }).notNull(),
    structureType: text("structure_type").notNull(),
    markCategory: text("mark_category").notNull(),
    lateralSide: text("lateral_side"),
    name: text("name"),
    shape: text("shape"),
    colors: text("colors").array(),
    colorPattern: text("color_pattern"),
    topmarkShape: text("topmark_shape"),
    topmarkColor: text("topmark_color"),
    hasLight: boolean("has_light").notNull().default(false),
    lightCharacteristic: text("light_characteristic"),
    lightColor: text("light_color"),
    lightRangeNm: numeric("light_range_nm"),
    lightElevationM: numeric("light_elevation_m"),
    properties: jsonb("properties").notNull().default({}),
  },
  (table) => [uniqueIndex("navigation_aids_source_key_idx").on(table.sourceKey)],
);

export type NavigationAid = typeof navigationAids.$inferSelect;
export type NewNavigationAid = typeof navigationAids.$inferInsert;
