import { Pool } from "pg";
import { rebuildAnalyticsForUpload } from "../src/services/analytics/rebuild";

type Args = {
  campaignId?: string;
  cityIbgeCodes: number[];
  dryRun: boolean;
};

function getArg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseArgs(): Args {
  const city = getArg("city");
  const campaignId = getArg("campaign-id");
  const dryRun = process.argv.includes("--dry-run");

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
    throw new Error("Uso: npm run assign:sections:neighborhoods -- --city priority|curitiba|sao-jose-dos-pinhais [--campaign-id uuid]");
  }

  return { campaignId, cityIbgeCodes, dryRun };
}

async function preview(pool: Pool, cityIbgeCodes: number[]) {
  const result = await pool.query(
    `
    WITH target_sections AS (
      SELECT
        s.id,
        m.name AS municipality,
        concat_ws(' ', s.voting_place_name, s.address, s.neighborhood) AS searchable
      FROM electoral_sections s
      JOIN municipalities m ON m.id = s.municipality_id
      WHERE m.ibge_code = ANY($1::integer[])
    ),
    matches AS (
      SELECT
        s.id,
        s.municipality,
        n.name AS neighborhood_name,
        row_number() OVER (PARTITION BY s.id ORDER BY length(n.normalized) DESC, n.name ASC) AS rank,
        count(*) OVER (PARTITION BY s.id) AS alternatives
      FROM target_sections s
      JOIN neighborhoods n ON n.municipality_id = (
        SELECT id FROM municipalities WHERE name = s.municipality LIMIT 1
      )
      WHERE regexp_replace(
        upper(translate(s.searchable,
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
        )),
        '[^A-Z0-9]+', ' ', 'g'
      ) LIKE '% ' || regexp_replace(n.normalized, '[^A-Z0-9]+', ' ', 'g') || ' %'
    )
    SELECT
      municipality,
      count(DISTINCT id)::integer AS matched_sections,
      count(DISTINCT id) FILTER (WHERE alternatives = 1)::integer AS unambiguous_sections
    FROM matches
    WHERE rank = 1
    GROUP BY municipality
    ORDER BY municipality
    `,
    [cityIbgeCodes]
  );

  return result.rows;
}

async function assignByText(pool: Pool, cityIbgeCodes: number[]) {
  const result = await pool.query(
    `
    WITH target_sections AS (
      SELECT
        s.id,
        s.municipality_id,
        concat(' ', regexp_replace(
          upper(translate(concat_ws(' ', s.voting_place_name, s.address, s.neighborhood),
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
            'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
          )),
          '[^A-Z0-9]+', ' ', 'g'
        ), ' ') AS searchable
      FROM electoral_sections s
      JOIN municipalities m ON m.id = s.municipality_id
      WHERE m.ibge_code = ANY($1::integer[])
    ),
    ranked_matches AS (
      SELECT
        s.id AS section_id,
        n.id AS neighborhood_id,
        row_number() OVER (PARTITION BY s.id ORDER BY length(n.normalized) DESC, n.name ASC) AS rank,
        count(*) OVER (PARTITION BY s.id) AS alternatives
      FROM target_sections s
      JOIN neighborhoods n ON n.municipality_id = s.municipality_id
      WHERE s.searchable LIKE '% ' || regexp_replace(n.normalized, '[^A-Z0-9]+', ' ', 'g') || ' %'
    ),
    selected AS (
      SELECT section_id, neighborhood_id
      FROM ranked_matches
      WHERE rank = 1 AND alternatives = 1
    )
    UPDATE electoral_sections s
    SET
      neighborhood_id = n.id,
      neighborhood = n.name,
      neighborhood_assigned_at = now(),
      neighborhood_assignment_method = 'official_neighborhood_name_in_tse_text',
      neighborhood_assignment_confidence = 0.7000,
      updated_at = now()
    FROM selected
    JOIN neighborhoods n ON n.id = selected.neighborhood_id
    WHERE s.id = selected.section_id
    `,
    [cityIbgeCodes]
  );

  return result.rowCount ?? 0;
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
    console.info(`[assign:sections:neighborhoods] rebuilding upload=${upload.id}`);
    await rebuildAnalyticsForUpload(pool, upload.id, campaignId);
  }
}

async function main() {
  const args = parseArgs();
  const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

  try {
    const before = await preview(pool, args.cityIbgeCodes);

    if (args.dryRun) {
      console.info(JSON.stringify({ dryRun: true, preview: before }, null, 2));
      return;
    }

    const updated = await assignByText(pool, args.cityIbgeCodes);

    if (args.campaignId) {
      await rebuildCampaign(pool, args.campaignId);
    }

    console.info(JSON.stringify({ dryRun: false, updated, preview: before }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
