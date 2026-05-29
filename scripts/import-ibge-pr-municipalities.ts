import { Pool } from "pg";
import { normalizeText } from "../src/lib/utils";
import { getMunicipalityRegion, PRIORITY_MUNICIPALITY_NAMES } from "../src/services/pipeline/region-scope";

type IbgeMunicipality = {
  id: number;
  nome: string;
};

type GeoJsonFeature = {
  type: "Feature";
  geometry: unknown;
  properties?: {
    codarea?: string;
  };
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

const IBGE_PR_MUNICIPALITIES_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/41/municipios";
const IBGE_PR_MESH_URL = "https://servicodados.ibge.gov.br/api/v3/malhas/estados/41?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, application/vnd.geo+json"
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

  try {
    const [municipalities, mesh] = await Promise.all([
      fetchJson<IbgeMunicipality[]>(IBGE_PR_MUNICIPALITIES_URL),
      fetchJson<GeoJsonFeatureCollection>(IBGE_PR_MESH_URL)
    ]);

    const municipalitiesByIbgeCode = new Map(
      municipalities.map((municipality) => [municipality.id, municipality.nome])
    );

    let imported = 0;
    let skipped = 0;

    for (const feature of mesh.features) {
      const ibgeCode = Number(feature.properties?.codarea);
      const name = municipalitiesByIbgeCode.get(ibgeCode);

      if (!ibgeCode || !name || !feature.geometry) {
        skipped++;
        continue;
      }

      const normalized = normalizeText(name);

      const result = await pool.query(
        `
        UPDATE municipalities
        SET
          ibge_code = $1,
          name = $2,
          normalized = $3,
          region = $4,
          is_priority = $5,
          boundary = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)),
          centroid = ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)),
          updated_at = now()
        WHERE state = 'PR'
          AND (ibge_code = $1 OR normalized = $3)
        `,
        [
          ibgeCode,
          name,
          normalized,
          getMunicipalityRegion(name),
          PRIORITY_MUNICIPALITY_NAMES.has(normalized),
          JSON.stringify(feature.geometry)
        ]
      );

      imported += result.rowCount ?? 0;
    }

    console.info(`[import:ibge:municipalities] imported=${imported} skipped=${skipped}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
