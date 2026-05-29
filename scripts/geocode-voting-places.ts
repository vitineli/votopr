import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { normalizeText } from "../src/lib/utils";
import { rebuildAnalyticsForUpload } from "../src/services/analytics/rebuild";

type Args = {
  cityIbgeCodes: number[];
  campaignId?: string;
  limit: number;
  delayMs: number;
  minConfidence: number;
  provider: "photon" | "nominatim";
  dryRun: boolean;
  force: boolean;
};

type VotingPlace = {
  municipality_id: string;
  municipality_name: string;
  ibge_code: number;
  voting_place_number: number;
  voting_place_name: string;
  address: string;
};

type NominatimResult = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  display_name: string;
  class?: string;
  type?: string;
  importance?: number;
};

type PhotonFeature = {
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  };
};

type PhotonResult = {
  features?: PhotonFeature[];
};

type RawGeocodeResult = {
  providerPlaceId: string | null;
  latitude: number;
  longitude: number;
  displayName: string;
  kindClass?: string;
  kindType?: string;
  raw: unknown;
};

type GeocodeCandidate = {
  providerPlaceId: string | null;
  latitude: number;
  longitude: number;
  displayName: string;
  raw: unknown;
  confidence: number;
  insideMunicipality: boolean;
};

class NominatimRateLimitError extends Error {
  constructor(status: number, retryAfter: string | null) {
    super(`Nominatim limitou as requisicoes (${status})${retryAfter ? `; Retry-After=${retryAfter}` : ""}`);
    this.name = "NominatimRateLimitError";
  }
}

function getArg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseArgs(): Args {
  const city = getArg("city");
  const cityIbgeCodes = (() => {
    if (!city || city === "priority") return [4106902, 4125506];
    if (city === "curitiba") return [4106902];
    if (city === "sao-jose-dos-pinhais") return [4125506];
    return city
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value));
  })();

  if (cityIbgeCodes.length === 0) {
    throw new Error("Uso: npm run geocode:voting-places -- --city priority|curitiba|sao-jose-dos-pinhais [--provider photon|nominatim] [--campaign-id uuid]");
  }

  const provider = getArg("provider") ?? "photon";
  if (provider !== "photon" && provider !== "nominatim") {
    throw new Error("--provider deve ser photon ou nominatim");
  }

  return {
    cityIbgeCodes,
    campaignId: getArg("campaign-id"),
    limit: Number(getArg("limit") ?? 250),
    delayMs: Number(getArg("delay-ms") ?? 2000),
    minConfidence: Number(getArg("min-confidence") ?? 0.78),
    provider,
    dryRun: process.argv.includes("--dry-run"),
    force: process.argv.includes("--force")
  };
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedWords(value: string) {
  const stop = new Set([
    "R", "RUA", "AV", "AVENIDA", "N", "NO", "NUMERO", "SN", "S", "DE", "DA", "DO", "DAS", "DOS",
    "COLEGIO", "COLÉGIO", "ESCOLA", "MUNICIPAL", "ESTADUAL", "PROFESSOR", "PROFESSORA", "CEI", "CMEI",
    "PARANA", "PARANÁ", "BRASIL", "CURITIBA", "SAO", "SÃO", "JOSE", "JOSÉ", "PINHAIS"
  ]);

  return normalizeText(value)
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= 3 && !stop.has(word));
}

function nameSimilarity(votingPlaceName: string, displayName: string) {
  const source = new Set(normalizedWords(votingPlaceName));
  const target = new Set(normalizedWords(displayName));
  if (source.size === 0 || target.size === 0) return 0;

  let matches = 0;
  for (const word of source) {
    if (target.has(word)) matches += 1;
  }

  return matches / source.size;
}

function buildQuery(place: VotingPlace) {
  return compact(`${place.voting_place_name}, ${place.address}, ${place.municipality_name}, Paraná, Brasil`);
}

function buildQueryCandidates(place: VotingPlace) {
  return Array.from(new Set([
    compact(`${place.voting_place_name}, ${place.address}, ${place.municipality_name}, Paraná, Brasil`),
    compact(`${place.address}, ${place.municipality_name}, Paraná, Brasil`),
    compact(`${place.voting_place_name}, ${place.municipality_name}, Paraná, Brasil`)
  ]));
}

function nominatimToRaw(result: NominatimResult): RawGeocodeResult | null {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    providerPlaceId: result.place_id ? String(result.place_id) : result.osm_id ? `${result.osm_type ?? "osm"}:${result.osm_id}` : null,
    latitude,
    longitude,
    displayName: result.display_name,
    kindClass: result.class,
    kindType: result.type,
    raw: result
  };
}

function photonDisplayName(feature: PhotonFeature) {
  const properties = feature.properties ?? {};
  const street = compact(`${properties.street ?? ""} ${properties.housenumber ?? ""}`);

  return [
    properties.name,
    street,
    properties.district,
    properties.city ?? properties.county,
    properties.state,
    properties.country,
    properties.postcode
  ].filter(Boolean).join(", ");
}

function photonToRaw(feature: PhotonFeature): RawGeocodeResult | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const properties = feature.properties ?? {};
  return {
    providerPlaceId: properties.osm_id ? `${properties.osm_type ?? "osm"}:${properties.osm_id}` : null,
    latitude,
    longitude,
    displayName: photonDisplayName(feature),
    kindClass: properties.osm_key,
    kindType: properties.osm_value,
    raw: feature
  };
}

async function fetchNominatim(query: string) {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: "5",
    addressdetails: "1",
    countrycodes: "br"
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "VotoPR/1.0 electoral-gis-research"
    }
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new NominatimRateLimitError(response.status, response.headers.get("retry-after"));
    }

    throw new Error(`Nominatim falhou (${response.status})`);
  }

  const results = await response.json() as NominatimResult[];
  return results.map(nominatimToRaw).filter((result): result is RawGeocodeResult => Boolean(result));
}

async function fetchPhoton(query: string) {
  const params = new URLSearchParams({
    q: query,
    limit: "5"
  });

  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "VotoPR/1.0 electoral-gis-research"
    }
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new NominatimRateLimitError(response.status, response.headers.get("retry-after"));
    }

    const body = await response.text();
    throw new Error(`Photon falhou (${response.status}) ${body.slice(0, 180)}`);
  }

  const result = await response.json() as PhotonResult;
  return (result.features ?? []).map(photonToRaw).filter((feature): feature is RawGeocodeResult => Boolean(feature));
}

async function fetchProvider(provider: Args["provider"], query: string) {
  return provider === "photon" ? fetchPhoton(query) : fetchNominatim(query);
}

async function isInsideMunicipality(pool: Pool, municipalityId: string, latitude: number, longitude: number) {
  const result = await pool.query<{ inside: boolean }>(
    `
    SELECT ST_Contains(boundary, ST_SetSRID(ST_MakePoint($3, $2), 4326)) AS inside
    FROM municipalities
    WHERE id = $1
    `,
    [municipalityId, latitude, longitude]
  );

  return Boolean(result.rows[0]?.inside);
}

async function rankCandidates(pool: Pool, place: VotingPlace, results: RawGeocodeResult[]) {
  const candidates: GeocodeCandidate[] = [];

  for (const result of results) {
    const latitude = result.latitude;
    const longitude = result.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const insideMunicipality = await isInsideMunicipality(pool, place.municipality_id, latitude, longitude);
    const similarity = nameSimilarity(place.voting_place_name, result.displayName);
    const displayNormalized = normalizeText(result.displayName);
    const municipalityHit = displayNormalized.includes(normalizeText(place.municipality_name)) ? 0.18 : 0;
    const hasAddressHit = normalizeText(place.address)
      .split(/\s+/)
      .filter((word) => word.length > 4)
      .some((word) => displayNormalized.includes(word));
    const addressHit = hasAddressHit ? 0.12 : 0;
    const amenityBonus = ["amenity", "building"].includes(result.kindClass ?? "") ? 0.05 : 0;
    const insideBonus = insideMunicipality ? 0.3 : -0.45;
    const baseConfidence = Math.max(0, Math.min(1, similarity * 0.45 + municipalityHit + addressHit + amenityBonus + insideBonus));
    const hasReliableIdentity = similarity >= 0.35 || hasAddressHit;
    const confidence = hasReliableIdentity ? baseConfidence : Math.min(baseConfidence, 0.61);

    candidates.push({
      providerPlaceId: result.providerPlaceId,
      latitude,
      longitude,
      displayName: result.displayName,
      raw: result,
      confidence: Number(confidence.toFixed(4)),
      insideMunicipality
    });
  }

  return candidates.sort((left, right) => right.confidence - left.confidence);
}

async function listVotingPlaces(pool: Pool, args: Args) {
  const result = await pool.query<VotingPlace>(
    `
    WITH places AS (
      SELECT DISTINCT ON (s.municipality_id, s.voting_place_number)
        s.municipality_id,
        m.name AS municipality_name,
        m.ibge_code,
        s.voting_place_number,
        s.voting_place_name,
        s.address
      FROM electoral_sections s
      JOIN municipalities m ON m.id = s.municipality_id
      LEFT JOIN voting_place_geocodes cached
        ON cached.municipality_id = s.municipality_id
        AND cached.voting_place_number = s.voting_place_number
        AND cached.provider = $3
        AND cached.status = 'GEOCODED'
      WHERE m.ibge_code = ANY($1::integer[])
        AND ($4::boolean OR cached.id IS NULL)
      ORDER BY s.municipality_id, s.voting_place_number, s.created_at ASC
    )
    SELECT *
    FROM places
    ORDER BY municipality_name ASC, voting_place_number ASC
    LIMIT $2
    `,
    [args.cityIbgeCodes, args.limit, args.provider, args.force]
  );

  return result.rows;
}

async function upsertGeocode(pool: Pool, place: VotingPlace, query: string, provider: Args["provider"], candidate: GeocodeCandidate | null, status: string) {
  await pool.query(
    `
    INSERT INTO voting_place_geocodes (
      municipality_id,
      voting_place_number,
      voting_place_name,
      address,
      query,
      provider,
      provider_place_id,
      status,
      confidence,
      latitude,
      longitude,
      geom,
      matched_display_name,
      raw_response,
      attempted_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      CASE WHEN $10::numeric IS NOT NULL AND $11::numeric IS NOT NULL THEN ST_SetSRID(ST_MakePoint($11, $10), 4326) ELSE NULL END,
      $12, $13, now()
    )
    ON CONFLICT (municipality_id, voting_place_number, provider) DO UPDATE SET
      voting_place_name = EXCLUDED.voting_place_name,
      address = EXCLUDED.address,
      query = EXCLUDED.query,
      provider_place_id = EXCLUDED.provider_place_id,
      status = EXCLUDED.status,
      confidence = EXCLUDED.confidence,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      geom = EXCLUDED.geom,
      matched_display_name = EXCLUDED.matched_display_name,
      raw_response = EXCLUDED.raw_response,
      attempted_at = now(),
      updated_at = now()
    `,
    [
      place.municipality_id,
      place.voting_place_number,
      place.voting_place_name,
      place.address,
      query,
      provider,
      candidate?.providerPlaceId ?? null,
      status,
      candidate?.confidence ?? null,
      candidate?.latitude ?? null,
      candidate?.longitude ?? null,
      candidate?.displayName ?? null,
      candidate ? JSON.stringify(candidate.raw) : null
    ]
  );
}

async function geocodePlace(pool: Pool, place: VotingPlace, provider: Args["provider"], minConfidence: number, delayMs: number) {
  let bestOverall: GeocodeCandidate | null = null;
  let bestQuery = buildQuery(place);
  const queries = buildQueryCandidates(place);

  for (const [index, query] of queries.entries()) {
    const results = await fetchProvider(provider, query);
    const candidates = await rankCandidates(pool, place, results);
    const best = candidates[0] ?? null;

    if (best && (!bestOverall || best.confidence > bestOverall.confidence)) {
      bestOverall = best;
      bestQuery = query;
    }

    if (best && best.insideMunicipality && best.confidence >= minConfidence) {
      return { query, candidate: best };
    }

    if (index < queries.length - 1) {
      await sleep(delayMs);
    }
  }

  return { query: bestQuery, candidate: bestOverall };
}

async function applyGeocodeToSections(pool: Pool, cityIbgeCodes: number[], minConfidence: number) {
  const sections = await pool.query(
    `
    UPDATE electoral_sections s
    SET
      latitude = g.latitude,
      longitude = g.longitude,
      geom = g.geom,
      geocoded_at = now(),
      updated_at = now()
    FROM voting_place_geocodes g
    JOIN municipalities m ON m.id = g.municipality_id
    WHERE s.municipality_id = g.municipality_id
      AND s.voting_place_number = g.voting_place_number
      AND m.ibge_code = ANY($1::integer[])
      AND g.status = 'GEOCODED'
      AND g.confidence >= $2
      AND g.geom IS NOT NULL
    `,
    [cityIbgeCodes, minConfidence]
  );

  const neighborhoods = await pool.query(
    `
    UPDATE electoral_sections s
    SET
      neighborhood_id = n.id,
      neighborhood = n.name,
      neighborhood_assigned_at = now(),
      neighborhood_assignment_method = 'official_neighborhood_polygon_contains_geocoded_voting_place',
      neighborhood_assignment_confidence = GREATEST(0.8500, COALESCE(g.confidence, 0.8500)),
      updated_at = now()
    FROM voting_place_geocodes g
    JOIN neighborhoods n ON n.municipality_id = g.municipality_id
    JOIN municipalities m ON m.id = g.municipality_id
    WHERE s.municipality_id = g.municipality_id
      AND s.voting_place_number = g.voting_place_number
      AND m.ibge_code = ANY($1::integer[])
      AND g.status = 'GEOCODED'
      AND g.confidence >= $2
      AND g.geom IS NOT NULL
      AND n.boundary IS NOT NULL
      AND ST_Contains(n.boundary, g.geom)
    `,
    [cityIbgeCodes, minConfidence]
  );

  return {
    sectionsUpdated: sections.rowCount ?? 0,
    neighborhoodsUpdated: neighborhoods.rowCount ?? 0
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
    console.info(`[geocode:voting-places] rebuilding upload=${upload.id}`);
    await rebuildAnalyticsForUpload(pool, upload.id, campaignId);
  }
}

async function main() {
  const args = parseArgs();
  const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

  try {
    const places = await listVotingPlaces(pool, args);
    let geocoded = 0;
    let rejected = 0;
    let failed = 0;
    let rateLimited = false;

    for (const [index, place] of places.entries()) {
      const query = buildQuery(place);
      console.info(`[geocode:voting-places] ${index + 1}/${places.length} ${place.municipality_name} #${place.voting_place_number} ${place.voting_place_name}`);

      if (args.dryRun) {
        console.info(`  query=${query}`);
        continue;
      }

      try {
        const result = await geocodePlace(pool, place, args.provider, args.minConfidence, args.delayMs);
        const best = result.candidate;

        if (best && best.insideMunicipality && best.confidence >= args.minConfidence) {
          await upsertGeocode(pool, place, result.query, args.provider, best, "GEOCODED");
          geocoded += 1;
          console.info(`  ok confidence=${best.confidence} ${best.displayName}`);
        } else {
          await upsertGeocode(pool, place, result.query, args.provider, best, "REJECTED");
          rejected += 1;
          console.info(`  rejected confidence=${best?.confidence ?? 0} inside=${best?.insideMunicipality ?? false}`);
        }
      } catch (error) {
        if (error instanceof NominatimRateLimitError) {
          rateLimited = true;
          console.error(`  paused ${error.message}`);
          break;
        }

        failed += 1;
        console.error(`  failed ${error instanceof Error ? error.message : String(error)}`);
        await upsertGeocode(pool, place, query, args.provider, null, "FAILED");
      }

      if (index < places.length - 1) {
        await sleep(args.delayMs);
      }
    }

    const applied = args.dryRun
      ? { sectionsUpdated: 0, neighborhoodsUpdated: 0 }
      : await applyGeocodeToSections(pool, args.cityIbgeCodes, args.minConfidence);

    if (args.campaignId && !args.dryRun) {
      await rebuildCampaign(pool, args.campaignId);
    }

    console.info(JSON.stringify({
      dryRun: args.dryRun,
      provider: args.provider,
      requested: places.length,
      geocoded,
      rejected,
      failed,
      rateLimited,
      applied
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
