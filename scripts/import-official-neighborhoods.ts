import fs from "node:fs/promises";
import { Pool } from "pg";
import { normalizeText } from "../src/lib/utils";
import { rebuildAnalyticsForUpload } from "../src/services/analytics/rebuild";

type CityKey = "curitiba" | "sao-jose-dos-pinhais";

type Args = {
  city: CityKey;
  file?: string;
  url?: string;
  nameProp?: string;
  codeProp?: string;
  source: string;
  sourceUrl?: string;
  dryRun: boolean;
  assignSections: boolean;
  rebuildCampaignId?: string;
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

const CITY_CONFIG: Record<CityKey, {
  name: string;
  ibgeCode: number;
  defaultNameProp: string;
  defaultCodeProp: string;
  defaultSource: string;
  defaultUrl?: string;
}> = {
  curitiba: {
    name: "Curitiba",
    ibgeCode: 4106902,
    defaultNameProp: "nome",
    defaultCodeProp: "codigo",
    defaultSource: "ippuc_geocuritiba",
    defaultUrl: "https://geocuritiba.ippuc.org.br/server/rest/services/GeoCuritiba/Publico_Interno_GeoCuritiba_BaseCartografica_para_BC/MapServer/44"
  },
  "sao-jose-dos-pinhais": {
    name: "Sao Jose dos Pinhais",
    ibgeCode: 4125506,
    defaultNameProp: "bairro2015",
    defaultCodeProp: "objectid",
    defaultSource: "geosjp",
    defaultUrl: "https://geo.sjp.pr.gov.br/server/rest/services/Bairros/Bairros/MapServer/1"
  }
};

function getArg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseArgs(): Args {
  const city = getArg("city") as CityKey | undefined;
  if (!city || !CITY_CONFIG[city]) {
    throw new Error("Uso: npm run import:neighborhoods:official -- --city curitiba|sao-jose-dos-pinhais [--file bairros.geojson | --url https://...]");
  }

  const config = CITY_CONFIG[city];
  const url = getArg("url") ?? config.defaultUrl;
  const file = getArg("file");

  if (!file && !url) {
    throw new Error(`Fonte oficial nao configurada para ${config.name}. Informe --file ou --url do GeoJSON/ArcGIS REST oficial.`);
  }

  return {
    city,
    file,
    url,
    nameProp: getArg("name-prop") ?? config.defaultNameProp,
    codeProp: getArg("code-prop") ?? config.defaultCodeProp,
    source: getArg("source") ?? config.defaultSource,
    sourceUrl: getArg("source-url") ?? url,
    dryRun: process.argv.includes("--dry-run"),
    assignSections: process.argv.includes("--assign-sections"),
    rebuildCampaignId: getArg("rebuild-campaign-id")
  };
}

function slugify(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readStringProp(feature: GeoJsonFeature, prop: string | undefined) {
  if (!prop) return undefined;
  const value = feature.properties?.[prop];
  if (value === null || value === undefined) return undefined;
  return String(value).trim();
}

function assertFeatureCollection(value: unknown): GeoJsonFeatureCollection {
  const parsed = value as GeoJsonFeatureCollection;
  if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("Fonte invalida: esperado GeoJSON FeatureCollection.");
  }

  return parsed;
}

function isArcGisLayerUrl(url: string) {
  return /\/(FeatureServer|MapServer)\/\d+\/?$/i.test(url);
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/geo+json, application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar fonte (${response.status}) ${url}`);
  }

  return response.json() as Promise<unknown>;
}

async function fetchArcGisGeoJson(layerUrl: string) {
  const pageSize = 2000;
  let offset = 0;
  const features: GeoJsonFeature[] = [];

  for (;;) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      returnGeometry: "true",
      f: "geojson",
      outSR: "4326",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize)
    });

    const page = assertFeatureCollection(await fetchJson(`${layerUrl.replace(/\/$/, "")}/query?${params.toString()}`));
    features.push(...page.features);

    if (page.features.length < pageSize) break;
    offset += pageSize;
  }

  return { type: "FeatureCollection", features } satisfies GeoJsonFeatureCollection;
}

async function loadGeoJson(args: Args) {
  if (args.file) {
    return assertFeatureCollection(JSON.parse(await fs.readFile(args.file, "utf8")));
  }

  if (!args.url) {
    throw new Error("Fonte nao informada.");
  }

  if (isArcGisLayerUrl(args.url)) {
    return fetchArcGisGeoJson(args.url);
  }

  return assertFeatureCollection(await fetchJson(args.url));
}

async function getMunicipalityId(pool: Pool, city: CityKey) {
  const config = CITY_CONFIG[city];
  const result = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM municipalities
    WHERE state = 'PR' AND ibge_code = $1
    LIMIT 1
    `,
    [config.ibgeCode]
  );

  const municipality = result.rows[0];
  if (!municipality) {
    throw new Error(`Municipio nao encontrado no banco: ${config.name} IBGE ${config.ibgeCode}. Importe municipios IBGE antes.`);
  }

  return municipality.id;
}

async function validateGeometry(pool: Pool, geometry: unknown) {
  const result = await pool.query<{
    geojson: string | null;
    is_valid: boolean;
    is_empty: boolean;
    area: string | null;
  }>(
    `
    WITH raw AS (
      SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
    ),
    cleaned AS (
      SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)) AS geom
      FROM raw
    )
    SELECT
      ST_AsGeoJSON(geom) AS geojson,
      ST_IsValid(geom) AS is_valid,
      ST_IsEmpty(geom) AS is_empty,
      ST_Area(geography(geom))::text AS area
    FROM cleaned
    `,
    [JSON.stringify(geometry)]
  );

  const row = result.rows[0];
  if (!row?.geojson || !row.is_valid || row.is_empty || Number(row.area ?? 0) <= 0) {
    throw new Error("Geometria de bairro invalida ou vazia.");
  }

  return row.geojson;
}

async function importNeighborhood(pool: Pool, input: {
  municipalityId: string;
  name: string;
  officialCode?: string;
  source: string;
  sourceUrl?: string;
  geometryGeoJson: string;
}) {
  const normalized = normalizeText(input.name);
  const slug = slugify(input.name);

  await pool.query(
    `
    INSERT INTO neighborhoods (
      municipality_id,
      name,
      normalized,
      slug,
      source,
      official_code,
      source_url,
      boundary,
      centroid,
      imported_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326)),
      ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326)),
      now()
    )
    ON CONFLICT (municipality_id, normalized) DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      source = EXCLUDED.source,
      official_code = EXCLUDED.official_code,
      source_url = EXCLUDED.source_url,
      boundary = EXCLUDED.boundary,
      centroid = EXCLUDED.centroid,
      imported_at = now(),
      updated_at = now()
    `,
    [
      input.municipalityId,
      input.name,
      normalized,
      slug,
      input.source,
      input.officialCode ?? null,
      input.sourceUrl ?? null,
      input.geometryGeoJson
    ]
  );
}

async function assignSections(pool: Pool, municipalityId: string) {
  const byName = await pool.query(
    `
    UPDATE electoral_sections sections
    SET
      neighborhood_id = neighborhoods.id,
      neighborhood = neighborhoods.name,
      updated_at = now()
    FROM neighborhoods
    WHERE sections.municipality_id = $1
      AND neighborhoods.municipality_id = sections.municipality_id
      AND sections.neighborhood IS NOT NULL
      AND neighborhoods.normalized = regexp_replace(
        upper(translate(sections.neighborhood,
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
        )),
        '\\s+', ' ', 'g'
      )
    `,
    [municipalityId]
  );

  const byGeometry = await pool.query(
    `
    UPDATE electoral_sections sections
    SET
      neighborhood_id = neighborhoods.id,
      neighborhood = neighborhoods.name,
      updated_at = now()
    FROM neighborhoods
    WHERE sections.municipality_id = $1
      AND neighborhoods.municipality_id = sections.municipality_id
      AND sections.geom IS NOT NULL
      AND neighborhoods.boundary IS NOT NULL
      AND ST_Contains(neighborhoods.boundary, sections.geom)
    `,
    [municipalityId]
  );

  return {
    byName: byName.rowCount ?? 0,
    byGeometry: byGeometry.rowCount ?? 0
  };
}

async function rebuildCampaign(pool: Pool, campaignId: string) {
  const uploads = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM electoral_uploads
    WHERE campaign_id = $1 AND status = 'COMPLETED'
    ORDER BY created_at ASC
    `,
    [campaignId]
  );

  for (const upload of uploads.rows) {
    console.info(`[neighborhoods] rebuilding analytics upload=${upload.id}`);
    await rebuildAnalyticsForUpload(pool, upload.id, campaignId);
  }
}

async function main() {
  const args = parseArgs();
  const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

  try {
    const collection = await loadGeoJson(args);
    const municipalityId = await getMunicipalityId(pool, args.city);
    let imported = 0;
    let skipped = 0;

    for (const feature of collection.features) {
      const name = readStringProp(feature, args.nameProp);
      if (!name || !feature.geometry) {
        skipped += 1;
        continue;
      }

      const officialCode = readStringProp(feature, args.codeProp);
      const geometryGeoJson = await validateGeometry(pool, feature.geometry);

      if (!args.dryRun) {
        await importNeighborhood(pool, {
          municipalityId,
          name,
          officialCode,
          source: args.source,
          sourceUrl: args.sourceUrl,
          geometryGeoJson
        });
      }

      imported += 1;
    }

    let assigned = { byName: 0, byGeometry: 0 };
    if (args.assignSections && !args.dryRun) {
      assigned = await assignSections(pool, municipalityId);
    }

    if (args.rebuildCampaignId && !args.dryRun) {
      await rebuildCampaign(pool, args.rebuildCampaignId);
    }

    console.info(JSON.stringify({
      city: args.city,
      imported,
      skipped,
      dryRun: args.dryRun,
      assigned
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
