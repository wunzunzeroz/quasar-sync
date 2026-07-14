# QUASAR Tile Pipeline — Technical Specification

> **Status:** Draft (for prototyping)
> **Owner:** matt@stormshadow.co
> **Scope:** A general-purpose, multi-dataset, multi-modal (vector + raster) tile
> pipeline for QUASAR — self-hosted, offline-capable, vendor-neutral.
> **Related repos:** `quasar-sync` (ingest/normalize), `quasar-tiler` (NEW — bake),
> `quasar-api` (control plane), `quasar-frontend` (render).

---

## 1. Summary

QUASAR needs to compute its own map tiles on the backend and serve them to web and
native apps under full control — no runtime dependency on a tile vendor. The data is
not only nautical: nav aids today; slope gradient/aspect, climbing crags, and other
datasets tomorrow. The platform must treat every dataset uniformly and must work
**fully offline** at sea / in the backcountry.

The core design decision is to make **"tileset"** a first-class, config-driven concept.
Every dataset — including the basemap — is a tileset produced by a pluggable **recipe**
and published as an immutable, versioned **PMTiles** file behind a CDN. The serving,
caching, offline, and versioning machinery is identical for all tilesets; only the bake
recipe differs by modality (vector vs raster).

Rendering is **MapLibre** (open, offline-friendly, no tokens). The basemap is **LINZ**
(NZ-authoritative topo + aerial), self-hosted as PMTiles — LINZ Basemaps is itself
built on MapLibre + PMTiles, so this follows a proven NZ-government blueprint.

---

## 2. Goals & Non-Goals

### Goals
- **Own the pipeline end-to-end:** compute tiles on our backend, serve as we like.
- **Multi-dataset & open:** adding a new dataset is a config entry + (rarely) a new
  recipe — never an architecture change.
- **Multi-modal:** vector (MVT) and raster tiles are first-class equals.
- **Fully offline:** base and overlays render with no connectivity.
- **Online-first where it matters:** large/fresh data (aerial imagery) prefers live
  tiles when connected, cached AOI when not.
- **No runtime vendor lock-in:** open formats (MVT, PMTiles), open renderer (MapLibre),
  open data (LINZ CC-BY). External dependencies exist only at **bake time**.
- **Boring, scalable, idiomatic:** immutable versioned files + CDN; separation of
  concerns; patterns that mirror the existing codebase (config-driven, registries).

### Non-Goals (initially)
- Official S-52/ENC chart rendering (we use our own vector styling).
- Global coverage (NZ-first; global fallback base is a future tileset, not a redesign).
- Real-time collaborative tile editing.
- Server-side dynamic tile rendering as the primary path (baked-first; dynamic only if
  a specific dataset later demands sub-bake freshness).

---

## 3. Requirements

### Functional
- F1. Produce vector tiles from PostGIS tables (e.g. normalized `navigation_aids`).
- F2. Produce raster tiles from DEMs (slope gradient, slope aspect, hillshade).
- F3. Produce the basemap tilesets from LINZ data (topo vector + aerial raster).
- F4. Publish each tileset as an immutable, independently-versioned PMTiles file.
- F5. Expose a machine-readable **manifest** describing all current tilesets.
- F6. Frontend composes base + overlays from the manifest into a MapLibre style.
- F7. Support per-tileset **source strategies**: offline-first, online-first,
  online-only, bundled.
- F8. On-device download of tileset packs (whole or AOI extract) for offline use.
- F9. Serve live/dynamic data (tracking, user nav objects) as authed GeoJSON — not tiled.
- F10. Allow re-baking a tileset without re-syncing upstream data.

### Non-Functional
- N1. Offline correctness: no blank/half-written tilesets ever reach a device.
- N2. Scalability: ~99% of tile reads served from CDN edge; origin near-idle.
- N3. Immutability: a published generation never mutates; rollback is a pointer flip.
- N4. Portability: no format or API ties us to a single renderer/vendor.
- N5. Cost: zero per-tile billing; storage + CDN egress only (prefer zero-egress store).
- N6. Observability: every bake logs generation, feature/tile counts, size, duration.
- N7. Licensing: LINZ CC-BY attribution shown in-app; per-dataset imagery licensing
  verified before offline redistribution.

---

## 4. Decisions (settled stack)

| Concern | Decision | Rationale (alternatives rejected) |
|---|---|---|
| Tile format (vector) | **MVT** | Open spec; consumed by every renderer. |
| Tile format (raster) | **WebP/PNG in PMTiles** | Same container as vector; range-request friendly. |
| Container / distribution | **PMTiles** | Single file, HTTP range, offline-capable, no tile server process. |
| Native offline fallback | **MBTiles emitted alongside** | De-risks native SDKs that digest local MBTiles more easily. |
| Vector baker | **tippecanoe** | Industry standard; per-zoom generalization control. |
| Raster baker | **GDAL / gdaldem** | Standard slope/aspect/hillshade + tiling. |
| Renderer | **MapLibre GL JS (web) + @maplibre/maplibre-react-native (native)** | Open, offline-friendly, no tokens; PMTiles support. Mapbox rejected: proprietary SDK, token/billing, weak custom-tile offline. |
| Basemap | **LINZ (topo vector + aerial raster), self-hosted PMTiles** | NZ-authoritative; LINZ Basemaps is MapLibre+PMTiles already. Hosted provider rejected: runtime dependency + offline licensing seam. |
| Style spec | **MapLibre style JSON (open subset)** | Restyle without re-baking; renderer stays swappable. |
| Serving | **Object storage + CDN, range requests** | Boring, scalable; "tile server" is just files. |
| Storage | **R2 (zero egress) or GCS+Cloud CDN (in-region)** | Egress dominates tile cost; both viable. |
| Live/user data | **Authed GeoJSON via Nest** | Small, per-workspace, volatile — tiling adds nothing. |

Decision log / ADR narrative lives in §17 open questions + git history of this file.

---

## 5. System Architecture

### 5.1 Topology

```
                     ┌──────────────────────────────────────────────┐
  data sources       │                CONTROL / DATA PLANE          │
  (bake-time only)   │                                              │
  ─────────────      │   quasar-sync ── Kart clone ──► source PostGIS│
  Kart @koordinates ─┼─► (existing)     transform  ──► dest PostGIS  │
  LINZ Data Service ─┤                                    │         │
  LINZ DEM ──────────┤                                    │ reads   │
                     │                                    ▼         │
                     │   quasar-tiler (NEW) ── recipes ──► bake      │
                     │     registry of tilesets           │         │
                     │                                    ▼         │
                     │   *.pmtiles (+*.mbtiles) ─► Object store + CDN│
                     │   manifest.json ──────────► (published)      │
                     └───────────────┬──────────────────────────────┘
                                     │ GET /tiles/manifest (control)
                                     │ range GET *.pmtiles (data)
                                     ▼
                     ┌──────────────────────────────────────────────┐
                     │ quasar-frontend (web + native, MapLibre)     │
                     │  • reads manifest → composes style           │
                     │  • tile source resolver (per-tileset strategy)│
                     │  • offline pack manager (download/verify/swap)│
                     │  • authed GeoJSON for live/user data (via API)│
                     └──────────────────────────────────────────────┘

  quasar-api (Nest): control plane only — serves manifest + authed live/user GeoJSON.
                     Never proxies tile bytes.
```

### 5.2 End-to-end data flow

1. **Ingest** — `quasar-sync` clones Kart repos → source PostGIS (unchanged).
2. **Normalize** — `quasar-sync` transforms → `navigation_aids` in dest PostGIS (unchanged).
3. **Trigger** — on completion, sync signals the tiler ("gen ready for tilesets X…").
4. **Bake** — `quasar-tiler` runs each due tileset's recipe → versioned `*.pmtiles`
   (+ `*.mbtiles`), computes stats, runs guards.
5. **Publish** — upload artifacts; write a new `manifest.json` **last** (atomic advance).
6. **Serve** — object storage + CDN serves immutable files via range requests.
7. **Render** — frontend reads manifest, composes MapLibre style, resolves tiles per
   strategy (online-first / offline-first / …), downloads packs for offline.

---

## 6. The Tileset Platform (core abstraction)

Everything — including the basemap — is a **tileset**. The base is not special.

### 6.1 Tileset config (input to the tiler; config-driven like `repos.yaml`)

```ts
type TileKind = "vector" | "raster";
type Role = "basemap" | "overlay";
type SourceStrategy = "offline-first" | "online-first" | "online-only" | "bundled";
type Cadence = "on-sync" | "manual" | `cron:${string}`;

interface TileSetConfig {
  id: string;                 // "navaids", "linz-aerial", "slope-aspect", "crags"
  role: Role;
  kind: TileKind;
  recipe: string;             // recipe id in the registry
  source: SourceRef;          // PostGIS query | DEM url | LINZ dataset | GeoJSON …
  zoom: { min: number; max: number };
  sourceStrategy: SourceStrategy;
  cadence: Cadence;           // when to (re)bake
  styleFragment?: string;     // path/id of the MapLibre layer fragment(s)
  attribution: string;        // e.g. "Sourced from LINZ. CC BY 4.0"
  license: string;            // SPDX-ish; gates offline redistribution
  emitMbtiles?: boolean;      // native offline fallback (default: role==="basemap")
}

type SourceRef =
  | { type: "postgis"; query: string }        // ST_AsMVT / GeoJSON export
  | { type: "dem"; url: string; derive?: "slope" | "aspect" | "hillshade" }
  | { type: "linz"; dataset: string }         // LINZ Data Service layer id
  | { type: "geojson"; url: string };
```

### 6.2 Recipe (producer) interface — plugin registry, mirrors the transformer registry

```ts
interface BakeContext {
  config: TileSetConfig;
  generation: number;         // next generation for this tileset
  workDir: string;            // scratch
  db?: PostgresClient;        // for postgis sources
}

interface BakeOutput {
  pmtilesPath: string;
  mbtilesPath?: string;
  stats: {
    features?: number;        // vector
    tileCount?: number;       // raster
    bytes: number;
    minzoom: number;
    maxzoom: number;
    bounds: [number, number, number, number]; // [w,s,e,n]
  };
}

interface TileRecipe {
  id: string;
  kind: TileKind;
  bake(ctx: BakeContext): Promise<BakeOutput>;
}

// registry: Map<string, TileRecipe>  — getRecipe(config.recipe)
```

### 6.3 Tileset catalog (initial)

| id | role | kind | recipe | source | strategy | cadence |
|---|---|---|---|---|---|---|
| `linz-topo` | basemap | vector | `vector-linz` | LINZ topographic | offline-first | cron (infrequent) |
| `linz-aerial` | basemap | raster | `raster-imagery` | LINZ aerial | **online-first** | cron (infrequent) |
| `navaids` | overlay | vector | `vector-postgis` | dest PostGIS `navigation_aids` | offline-first | on-sync |
| `slope-gradient` | overlay | raster | `raster-dem` | LINZ DEM (derive=slope) | offline-first | manual |
| `slope-aspect` | overlay | raster | `raster-dem` | LINZ DEM (derive=aspect) | offline-first | manual |
| `crags` | overlay | vector | `vector-postgis`/`vector-geojson` | TBD | offline-first | manual |

### 6.4 Independent versioning & generations

Each tileset advances its **own** `generation`. A buoy edit re-bakes `navaids` only;
terrain and base are untouched. Generations are monotonic integers per tileset id.
Published filenames are `"{id}-v{generation}.pmtiles"`. Retain the last **K** (e.g. 5)
generations per tileset for rollback + in-flight clients.

---

## 7. Ingest & Source Data (bake-time)

- **Vector via Kart** — unchanged `quasar-sync` flow → normalized `navigation_aids`.
- **DEM / raster** — LINZ DEM (national 8m and/or regional 1m LiDAR) fetched as
  COG/GeoTIFF into the tiler work dir. Not Kart-managed; a distinct source type.
- **LINZ base** — topographic vector + aerial imagery from LINZ Data Service (or LINZ
  Basemaps exports). Attribution + per-dataset license recorded in config (§14).

All source access is **bake-time**; nothing here is on the runtime request path.

---

## 8. Bake Pipeline (`quasar-tiler`)

### 8.1 Vector recipe (`vector-postgis`, `vector-geojson`)
- Export source (PostGIS `ST_AsMVT`/GeoJSON, or supplied GeoJSON).
- **`scaleBand` → `minzoom` mapping** (semantic generalization, not density dropping):
  harbor→~13, approach→~11, coastal→~9, general→~7, overview→~5 (tunable). Assign each
  feature a `minzoom` (or split scale bands into source-layers with per-layer zoom).
- `tippecanoe --output {id}-v{gen}.pmtiles` honoring zoom rules; final visibility/
  decluttering handled by the GL style.
- Optionally emit MBTiles for native offline.

### 8.2 Raster recipe — DEM derivatives (`raster-dem`)
```
DEM (COG)
  ├─ gdaldem slope  dem.tif  slope.tif   ─┐   apply color ramp
  └─ gdaldem aspect dem.tif  aspect.tif  ─┤   (gdaldem color-relief ramp.txt)
                                          ▼
                    gdal2tiles / rio-pmtiles → WebP raster PMTiles ({id}-v{gen}.pmtiles)
```
- **Styling fork (documented, default = bake the ramp):**
  - *Baked ramp* (default): styled slope/aspect tiles. Works on native today; restyle
    = re-bake (cheap for NZ AOI).
  - *Data-encoded* (upgrade path): single elevation tileset (Terrarium/Terrain-RGB) →
    MapLibre `hillshade` for free + `raster-color` ramps client-side (web). Slope/aspect
    as GPU products need custom work; treat as later.

### 8.3 Raster recipe — imagery (`raster-imagery`)
- Tile LINZ aerial COGs → WebP raster PMTiles. Full NZ is large: on device we ship
  **AOI extracts** (`pmtiles extract` by bbox), not the whole country (§11).

### 8.4 Basemap recipe — LINZ topo (`vector-linz`)
- Produce vector PMTiles from LINZ topographic data; adopt/adapt LINZ's MapLibre
  topographic style as the base style fragment, customized for SAR (day/night).

### 8.5 Outputs & guards (per bake)
- Artifacts: `{id}-v{gen}.pmtiles` (+ optional `.mbtiles`), `stats.json`.
- **Guards (must pass before publish):**
  - Non-empty: feature/tile count > 0.
  - Sanity delta: feature count not within an anomalous drop vs previous generation
    (configurable threshold) → fail, keep previous generation.
  - Bounds within expected AOI.
  - Checksums computed (`sha256`).
- On any guard failure: **do not advance the manifest**; keep last-good live; alert.

---

## 9. Serving Layer

### 9.1 Storage + CDN
- Object storage with HTTP range support behind a CDN. Preference: **Cloudflare R2**
  (zero egress) or **GCS + Cloud CDN** (in-region to Sydney/NZ). Requirement, not brand:
  *range-request-capable object storage + CDN*.
- The baked overlays/base need **no running tile server** — files only.

### 9.2 URLs, versioning, caching
- `https://cdn.quasar…/tiles/{id}-v{gen}.pmtiles`
- `Cache-Control: public, max-age=31536000, immutable`.
- New generation = new filename = new URL → **global invalidation with no purge API and
  no stale-tile bug class.** This is the load-bearing "boring & scalable" trick.

### 9.3 Manifest (control plane; served by Nest, short TTL)

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-14T00:00:00Z",
  "tilesets": [
    {
      "id": "linz-aerial",
      "role": "basemap",
      "kind": "raster",
      "generation": 3,
      "format": "pmtiles",
      "url": "https://cdn.quasar.example/tiles/linz-aerial-v3.pmtiles",
      "sha256": "…",
      "bounds": [166.0, -47.5, 178.6, -34.0],
      "minzoom": 0,
      "maxzoom": 21,
      "sourceStrategy": "online-first",
      "attribution": "Sourced from LINZ. CC BY 4.0",
      "offline": { "extractable": true }
    }
    // … navaids, linz-topo, slope-*, crags
  ]
}
```

- Manifest is the single source of truth clients read at startup / on refresh.
- Manifest advances **atomically and last**; clients only ever see fully-published gens.

---

## 10. Frontend Integration (MapLibre)

### 10.1 Renderers
- Web: **MapLibre GL JS**. Native: **@maplibre/maplibre-react-native**.
- PMTiles via the `pmtiles` protocol handler (`addProtocol("pmtiles", …)`) on web;
  native local-PMTiles support to be verified (§17 spike).

### 10.2 Style composition
- Base style = LINZ topographic MapLibre style (customized). Overlay tilesets contribute
  **style fragments** (their `styleFragment`) layered on top. The app assembles the final
  style from the manifest + fragments at runtime, so tilesets can be added without a
  frontend release when the fragment is data-driven.

### 10.3 Tile source resolver + per-tileset strategies  ← includes online-first aerial

A single **protocol handler** owns fetch policy so strategy lives in one place:

```ts
// registered as e.g. maplibregl.addProtocol("quasar", handler)
// tiles requested as: quasar://{tilesetId}/{z}/{x}/{y}

async function resolveTile(id: string, z: number, x: number, y: number)
  : Promise<ArrayBuffer | null> {
  switch (strategyFor(id)) {
    case "online-first":  // AERIAL: prefer live, fall back to cached AOI, skip if none
      return (await fromNetwork(id, z, x, y))       // live CDN/LINZ tile
          ?? (await fromLocalPack(id, z, x, y))     // cached AOI extract
          ?? null;                                  // no coverage → transparent
    case "offline-first": // vector base + most overlays
      return (await fromLocalPack(id, z, x, y))
          ?? (await fromNetwork(id, z, x, y));
    case "online-only":   // (reserved) purely live
      return fromNetwork(id, z, x, y);
    case "bundled":       // device pack only
      return fromLocalPack(id, z, x, y);
  }
}
```

- **Online-first (aerial):** try the network tile first; on failure/timeout/offline use
  the locally-cached AOI pack; if neither has the tile (coverage gap or unfetched AOI),
  return null so MapLibre renders nothing there (topo shows through beneath).
- `fromNetwork` for aerial may target the CDN copy or LINZ directly, per config.
- **Timeout budget** on `fromNetwork` for online-first so a flaky link degrades to cache
  quickly rather than hanging the map.
- Native caveat: MapLibre Native's custom-protocol/source hooks are more limited than web
  — the resolver may need a native shim (local range-reader). Flagged as a spike (§17).

### 10.4 Attribution
- Render required attribution strings (LINZ CC-BY etc.) from the manifest per active
  tileset.

---

## 11. Offline Model

### 11.1 Packs & AOI extracts
- **Vector/small tilesets** (topo, navaids, slope, crags): ship the whole PMTiles pack.
- **Aerial (large):** ship **AOI extracts** only — `pmtiles extract` by mission/region
  bbox — never the full country. Multiple named AOIs supported.

### 11.2 Download / verify / atomic swap
- Download `{id}-v{gen}.pmtiles` (or MBTiles on native), verify `sha256` from manifest,
  then **atomically** flip the local pointer for that tileset id. Never render a
  partially-written file.

### 11.3 Storage budget & eviction
- Per-tileset + global storage budgets. Evict oldest generations / least-recent AOIs
  under pressure. Aerial AOIs are the primary consumer.

### 11.4 Update flow
- On launch / connectivity, read manifest. For each tileset, if `generation` advanced and
  policy allows, download new pack, verify, swap. Old pack stays live until swap succeeds.

### 11.5 Strategy matrix

| Tileset | Strategy | Offline artifact | Notes |
|---|---|---|---|
| `linz-topo` | offline-first | full pack | authoritative base, small |
| `linz-aerial` | **online-first** | AOI extract | live when connected, cache at sea |
| `navaids` | offline-first | full pack | mission-critical, always local |
| `slope-*` | offline-first | full/AOI pack | planning data |
| `crags` | offline-first | full pack | small |
| tracking / user objects | online-only + app-cache | app state | not tiled (§12) |

---

## 12. Live / Dynamic Data Tier

- **Tracking** (vessels/users) and **user navigation objects** (waypoints, bearing lines,
  range rings, routes, areas, search patterns, passage plans) are **not tiled**.
- Served as **authed GeoJSON** (or a websocket feed for tracking) from `quasar-api`,
  rendered client-side, scoped to workspace.
- Offline for these rides the app's normal state/sync + local cache, **not** the tile
  pipeline. Only promote a layer to dynamic MVT if it grows large (e.g. dense historical
  tracks).

---

## 13. Control Plane (`quasar-api` / Nest)

- `GET /tiles/manifest` — current tileset catalog (short TTL / SWR). The only tile-related
  API. **Never proxies tile bytes.**
- Authed GeoJSON endpoints for live/user data (existing domain patterns).
- Optionally: signed-URL minting for any tilesets that must be access-controlled (default:
  reference tiles are public + cacheable).

---

## 14. Security, Auth, Licensing & Attribution

- **Reference tiles (LINZ-derived, nav aids):** public + cacheable. Do **not** gate
  per-tile with Clerk (kills cacheability + offline).
- **Private workspace data:** stays in the authed GeoJSON tier, never in public tiles.
- **Licensing:** LINZ open data is CC-BY 4.0 → show LINZ attribution in-app. **Verify
  per-dataset aerial imagery licensing** before baking for offline redistribution; record
  `license` + `attribution` per tileset in config, surface via manifest.
- **Signed URLs (optional):** short-lived CDN tokens for any tileset later deemed
  non-public — applied at the edge, preserving cacheability.

---

## 15. Correctness Invariants & Failure Modes

- **I1 Immutable generations:** a published `{id}-v{gen}` never changes.
- **I2 Atomic advance:** artifacts uploaded, then manifest written last; clients see gen
  N or N+1, never a partial.
- **I3 Independent failure domains:** a failed bake keeps last-good live; a failed sync
  never publishes wrong tiles.
- **I4 Empty/anomaly guard:** 0-feature or anomalous-drop bakes are rejected (§8.5).
- **I5 Idempotent/deterministic bakes:** re-running against a fixed source state yields
  equivalent output; safe to retry.
- **I6 Rollback = pointer flip:** repoint manifest to a retained prior generation; no
  rebuild.
- **I7 Offline atomicity:** device swaps packs only after checksum verification.

---

## 16. Observability & Ops

- Per bake: log `{tilesetId, generation, kind, features|tileCount, bytes, minzoom,
  maxzoom, bounds, durationMs}`.
- Publish metrics: manifest advance events; retained-generation counts; storage usage.
- Serving: CDN cache-hit ratio (target ≥95–99%), origin range-GET rate, error rates.
- Alerting on guard failures, bake failures, manifest-write failures.

---

## 17. Open Questions / Spikes to Resolve

- **S1 (highest risk) — MapLibre Native PMTiles offline:** verify first-class local
  PMTiles source support in the target `@maplibre/maplibre-react-native` version. Fallback:
  ship MBTiles to device + native range-reader shim.
- **S2 — Native online-first resolver:** confirm how to implement the §10.3 resolver on
  MapLibre Native (custom source / protocol equivalents, or a localhost tile shim).
- **S3 — LINZ self-host data path:** confirm the concrete route to bake LINZ topo (vector)
  and aerial (raster) into our own PMTiles (LINZ Data Service exports vs LINZ Basemaps
  artifacts); confirm redistribution + offline terms per dataset.
- **S4 — Storage/CDN choice:** R2 (zero egress) vs GCS+Cloud CDN (in-region). Decide on
  cost + latency for NZ users.
- **S5 — Tiler triggering:** sync→tiler trigger mechanism (HTTP call vs job row vs queue)
  and whether tiler starts as a `quasar-sync` phase or a standalone Railway service from
  day 1 (recommended: standalone, behind the recipe interface).
- **S6 — Raster styling:** baked-ramp (default) vs data-encoded elevation for slope/aspect;
  when/if to adopt Terrain-RGB + `raster-color`.
- **S7 — DEM sourcing/resolution:** national 8m vs regional 1m LiDAR; storage/bake budget.
- **S8 — AOI model:** how AOIs are defined/named/selected in-app for aerial offline packs.

---

## 18. Phased Rollout / Milestones

- **Phase 0 — Prove the shape (½–1 day):** manually bake one vector tileset (`navaids`
  from `navigation_aids`) **and** one raster tileset (slope from a sample DEM) → upload →
  render both in MapLibre **web** via pmtiles. Proves the single serving path handles both
  modalities. Resolves S6 direction.
- **Phase 1 — Tiler service + manifest:** stand up `quasar-tiler` (recipe registry,
  versioning, guards), object store + CDN, manifest endpoint in Nest; sync triggers tiler;
  web consumes manifest. Resolves S4, S5.
- **Phase 2 — LINZ base:** self-host `linz-topo` + `linz-aerial`; web renders full stack;
  implement the source resolver incl. **online-first aerial**. Resolves S3.
- **Phase 3 — Native offline:** on-device pack download/verify/swap; AOI extracts for
  aerial; native resolver. Resolves S1, S2, S8.
- **Phase 4 — Live/user tier:** authed GeoJSON for tracking + user nav objects with
  workspace scoping.
- **Phase 5 — Polish:** day/night SAR styling, sprites/fonts, rollback tooling, storage
  eviction UX.

---

## 19. Repo & Code Layout

```
quasar-tiler/ (NEW service — mirrors quasar-sync conventions)
  src/
    index.ts                 # entry: trigger endpoint + orchestration
    config/
      tilesets.yaml          # the tileset registry (config-driven)
      env.ts                 # zod-validated env (DB, storage creds, CDN base)
    domain/
      types.ts               # TileSetConfig, BakeOutput, Manifest …
    recipes/
      registry.ts            # getRecipe(id) — mirrors transformer registry
      vector-postgis.ts      # tippecanoe from PostGIS
      vector-geojson.ts
      vector-linz.ts         # LINZ topo → vector PMTiles
      raster-dem.ts          # gdaldem slope/aspect → raster PMTiles
      raster-imagery.ts      # LINZ aerial → raster PMTiles
    services/
      bake.ts                # orchestrates a tileset bake + guards
      publish.ts             # upload artifacts + atomic manifest advance
      storage.ts             # object-store client (R2/GCS)
    utils/logger.ts

quasar-sync/  (existing) — add: trigger tiler after transform
quasar-api/   (existing) — add: GET /tiles/manifest; (later) live GeoJSON endpoints
quasar-frontend/ (existing) — MapLibre migration; source resolver; offline pack manager
```

Design the tiler's interface (reads dest DB / sources, writes versioned PMTiles + advances
manifest, no shared runtime state) so that whether it runs as a standalone service or an
extracted `quasar-sync` phase is an ops decision, not an architecture one.

---

## 20. Glossary

- **MVT** — Mapbox Vector Tile (open spec, vendor-neutral).
- **PMTiles** — single-file, range-request tile archive (vector or raster).
- **MBTiles** — SQLite-based tile archive; native offline fallback.
- **Recipe** — a pluggable tileset producer (vector/raster).
- **Generation** — monotonic per-tileset version; drives immutable URLs + rollback.
- **AOI** — Area of Interest; bbox extract for offline (esp. aerial).
- **Source strategy** — per-tileset fetch policy: offline-first / online-first /
  online-only / bundled.
- **Manifest** — machine-readable catalog of current tilesets the frontend consumes.
