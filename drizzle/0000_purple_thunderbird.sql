CREATE TABLE "navigation_aids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_schema" text NOT NULL,
	"source_key" text NOT NULL,
	"source_fidn" integer NOT NULL,
	"source_object_type" text NOT NULL,
	"scale_band" text NOT NULL,
	"geom" geometry(Point, 4326) NOT NULL,
	"structure_type" text NOT NULL,
	"mark_category" text NOT NULL,
	"lateral_side" text,
	"name" text,
	"shape" text,
	"colors" text[],
	"color_pattern" text,
	"topmark_shape" text,
	"topmark_color" text,
	"has_light" boolean DEFAULT false NOT NULL,
	"light_characteristic" text,
	"light_color" text,
	"light_range_nm" numeric,
	"light_elevation_m" numeric,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "navigation_aids_source_key_idx" ON "navigation_aids" USING btree ("source_key");
