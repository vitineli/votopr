import fs from "node:fs/promises";
import { Pool } from "pg";
import { normalizeText } from "../src/lib/utils";
import { ensureBaseTerritorialRegions } from "../src/services/analytics/rebuild";

type Layer = "municipalities" | "neighborhoods" | "section-points";

type Args = {
  file: string;
  layer: Layer;
  nameProp: string;
  ibgeCodeProp?: string;
  tseCodeProp?: string;
  municipalityNameProp?: string;
  zoneProp?: string;
  sectionProp?: string;
  source: string;
  assignSections: boolean;
};

type GeoJsonFeature = {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry?: unknown;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const file = get("file");
  const layer = get("layer") as Layer | undefined;

  if (!file || !layer || !["municipalities", "neighborhoods", "section-points"].includes(layer)) {
    throw new Error(
      'Uso: npm run import:geo -- --layer municipalities|neighborhoods|section-points --file ".\\dados\\arquivo.geojson" --name-prop "name"'
    );
  }

  return {
    file,
    layer,
    nameProp: get("name-prop") ?? "name",
    ibgeCodeProp: get("ibge-code-prop"),
    tseCodeProp: get("tse-code-prop"),
    municipalityNameProp: get("municipality-name-prop"),
    zoneProp: get("zone-prop"),
    sectionProp: get("section-prop"),
    source: get("source") ?? layer,
    assignSections: args.includes("--assign-sections")
  };
}

function stringProp(feature: GeoJsonFeature, prop: string | undefined) {
  if (!prop) return undefined;
  const value = feature.properties?.[prop];
  return value === undefined || value === null ? undefined : String(value).trim();
}

function numberProp(feature: GeoJsonFeature, prop: string | undefined) {
  const value = stringProp(feature, prop);
  if (!value) return undefined;
  const parsed = Number(value.replace(/\D/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function loadGeoJson(file: string) {
  const raw = await fs.readFile(file, "utf8");
  const parsed = JSON.parse(raw) as GeoJsonFeatureCollection;

  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("GeoJSON invalido: esperado FeatureCollection.");
  }

  return parsed.features.filter((feature) => feature.geometry);
}

async function importMunicipalities(pool: Pool, args: Args, features: GeoJsonFeature[]) {
  for (const feature of features) {
    const name = stringProp(feature, args.nameProp);
    const ibgeCode = numberProp(feature, args.ibgeCodeProp);
    const tseCode = numberProp(feature, args.tseCodeProp);

    if (!name || (!ibgeCode && !tseCode)) continue;

    await pool.query(
      `
      UPDATE municipalities
      SET
        ibge_code = COALESCE($1, ibge_code),
        boundary = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)),
        centroid = ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)),
        updated_at = now()
      WHERE state = 'PR'
        AND (
          ($3::integer IS NOT NULL AND tse_code = $3)
          OR ($1::integer IS NOT NULL AND ibge_code = $1)
          OR normalized = $4
        )
      `,
      [ibgeCode ?? null, JSON.stringify(feature.geometry), tseCode ?? null, normalizeText(name)]
    );
  }
}

async function importNeighborhoods(pool: Pool, args: Args, features: GeoJsonFeature[]) {
  for (const feature of features) {
    const name = stringProp(feature, args.nameProp);
    const municipalityName = stringProp(feature, args.municipalityNameProp);
    const ibgeCode = numberProp(feature, args.ibgeCodeProp);
    const tseCode = numberProp(feature, args.tseCodeProp);

    if (!name || (!municipalityName && !ibgeCode && !tseCode)) continue;

    await pool.query(
      `
      WITH municipality AS (
        SELECT id
        FROM municipalities
        WHERE state = 'PR'
          AND (
            ($1::integer IS NOT NULL AND ibge_code = $1)
            OR ($2::integer IS NOT NULL AND tse_code = $2)
            OR ($3::text IS NOT NULL AND normalized = $3)
          )
        LIMIT 1
      )
      INSERT INTO neighborhoods (municipality_id, name, normalized, slug, source, boundary, centroid)
      SELECT
        municipality.id,
        $4,
        $5,
        lower(regexp_replace($5, '[^A-Z0-9]+', '-', 'g')),
        $6,
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326)),
        ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326))
      FROM municipality
      ON CONFLICT (municipality_id, normalized) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        source = EXCLUDED.source,
        boundary = EXCLUDED.boundary,
        centroid = EXCLUDED.centroid,
        updated_at = now()
      `,
      [
        ibgeCode ?? null,
        tseCode ?? null,
        municipalityName ? normalizeText(municipalityName) : null,
        name,
        normalizeText(name),
        args.source,
        JSON.stringify(feature.geometry)
      ]
    );
  }
}

async function importSectionPoints(pool: Pool, args: Args, features: GeoJsonFeature[]) {
  for (const feature of features) {
    const municipalityName = stringProp(feature, args.municipalityNameProp);
    const tseCode = numberProp(feature, args.tseCodeProp);
    const zone = numberProp(feature, args.zoneProp);
    const section = numberProp(feature, args.sectionProp);

    if ((!municipalityName && !tseCode) || !zone || !section) continue;

    await pool.query(
      `
      WITH municipality AS (
        SELECT id
        FROM municipalities
        WHERE state = 'PR'
          AND (
            ($1::integer IS NOT NULL AND tse_code = $1)
            OR ($2::text IS NOT NULL AND normalized = $2)
          )
        LIMIT 1
      ),
      target_section AS (
        SELECT s.id
        FROM electoral_sections s
        JOIN municipality m ON m.id = s.municipality_id
        JOIN electoral_zones z ON z.id = s.electoral_zone_id
        WHERE z.number = $3
          AND s.number = $4
        LIMIT 1
      )
      UPDATE electoral_sections
      SET
        geom = ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
        latitude = ST_Y(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))::numeric(10,7),
        longitude = ST_X(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))::numeric(10,7),
        geocoded_at = now(),
        updated_at = now()
      WHERE id IN (SELECT id FROM target_section)
      `,
      [
        tseCode ?? null,
        municipalityName ? normalizeText(municipalityName) : null,
        zone,
        section,
        JSON.stringify(feature.geometry)
      ]
    );
  }
}

async function assignSectionsBySpatialContainment(pool: Pool) {
  await pool.query(`
    UPDATE electoral_sections sections
    SET
      neighborhood_id = neighborhoods.id,
      neighborhood = neighborhoods.name,
      updated_at = now()
    FROM neighborhoods
    WHERE sections.municipality_id = neighborhoods.municipality_id
      AND sections.geom IS NOT NULL
      AND neighborhoods.boundary IS NOT NULL
      AND ST_Contains(neighborhoods.boundary, sections.geom)
  `);

  await pool.query(`
    UPDATE electoral_sections sections
    SET
      region_id = regions.id,
      updated_at = now()
    FROM territorial_regions regions
    WHERE sections.geom IS NOT NULL
      AND regions.boundary IS NOT NULL
      AND ST_Contains(regions.boundary, sections.geom)
  `);
}

async function main() {
  const args = parseArgs();
  const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

  try {
    const features = await loadGeoJson(args.file);
    await ensureBaseTerritorialRegions(pool);

    if (args.layer === "municipalities") {
      await importMunicipalities(pool, args, features);
    }

    if (args.layer === "neighborhoods") {
      await importNeighborhoods(pool, args, features);
    }

    if (args.layer === "section-points") {
      await importSectionPoints(pool, args, features);
    }

    if (args.assignSections) {
      await assignSectionsBySpatialContainment(pool);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
