import type { Pool } from "pg";

type TerritoryDefinition = {
  level: "STATE" | "METROPOLITAN_REGION" | "MUNICIPALITY" | "NEIGHBORHOOD" | "ZONE" | "SECTION";
  selectScope: string;
  joins: string;
  where: string;
  partitionScope: string;
};

const territoryDefinitions: TerritoryDefinition[] = [
  {
    level: "STATE",
    selectScope: `
      NULL::uuid AS municipality_id,
      NULL::uuid AS electoral_zone_id,
      NULL::uuid AS section_id,
      NULL::uuid AS neighborhood_id,
      state_region.id AS territorial_region_id
    `,
    joins: "JOIN territorial_regions state_region ON state_region.level = 'STATE' AND state_region.code = 'PR'",
    where: "m.state = 'PR'",
    partitionScope: "territorial_region_id"
  },
  {
    level: "METROPOLITAN_REGION",
    selectScope: `
      NULL::uuid AS municipality_id,
      NULL::uuid AS electoral_zone_id,
      NULL::uuid AS section_id,
      NULL::uuid AS neighborhood_id,
      rmc_region.id AS territorial_region_id
    `,
    joins: "JOIN territorial_regions rmc_region ON rmc_region.level = 'METROPOLITAN_REGION' AND rmc_region.code = 'RMC'",
    where: "m.region = 'REGIAO_METROPOLITANA_CURITIBA' OR m.region = 'PRIORIDADE_MVP'",
    partitionScope: "territorial_region_id"
  },
  {
    level: "MUNICIPALITY",
    selectScope: `
      ed.municipality_id,
      NULL::uuid AS electoral_zone_id,
      NULL::uuid AS section_id,
      NULL::uuid AS neighborhood_id,
      NULL::uuid AS territorial_region_id
    `,
    joins: "",
    where: "TRUE",
    partitionScope: "municipality_id"
  },
  {
    level: "ZONE",
    selectScope: `
      ed.municipality_id,
      ed.electoral_zone_id,
      NULL::uuid AS section_id,
      NULL::uuid AS neighborhood_id,
      NULL::uuid AS territorial_region_id
    `,
    joins: "",
    where: "TRUE",
    partitionScope: "municipality_id, electoral_zone_id"
  },
  {
    level: "SECTION",
    selectScope: `
      ed.municipality_id,
      ed.electoral_zone_id,
      ed.section_id,
      NULL::uuid AS neighborhood_id,
      NULL::uuid AS territorial_region_id
    `,
    joins: "",
    where: "TRUE",
    partitionScope: "municipality_id, electoral_zone_id, section_id"
  },
  {
    level: "NEIGHBORHOOD",
    selectScope: `
      ed.municipality_id,
      NULL::uuid AS electoral_zone_id,
      NULL::uuid AS section_id,
      s.neighborhood_id,
      NULL::uuid AS territorial_region_id
    `,
    joins: "JOIN electoral_sections s ON s.id = ed.section_id",
    where: "s.neighborhood_id IS NOT NULL",
    partitionScope: "municipality_id, neighborhood_id"
  }
];

export async function ensureBaseTerritorialRegions(pool: Pool) {
  await pool.query(`
    INSERT INTO territorial_regions (level, code, name, normalized, source)
    VALUES
      ('STATE', 'PR', 'Parana', 'PARANA', 'ibge'),
      ('METROPOLITAN_REGION', 'RMC', 'Regiao Metropolitana de Curitiba', 'REGIAO METROPOLITANA DE CURITIBA', 'amep')
    ON CONFLICT (level, code) DO UPDATE SET
      name = EXCLUDED.name,
      normalized = EXCLUDED.normalized,
      source = EXCLUDED.source
  `);
}

export async function rebuildAnalyticsForUpload(pool: Pool, uploadId: string, campaignId: string) {
  await ensureBaseTerritorialRegions(pool);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM territorial_vote_summaries WHERE upload_id = $1", [uploadId]);

    for (const territory of territoryDefinitions) {
      await client.query(
        `
        WITH grouped AS (
          SELECT
            ed.campaign_id,
            ed.upload_id,
            ed.election_year,
            ed.election_code,
            ed.round,
            ${territory.selectScope},
            ed.office_id,
            ed.party_id,
            ed.candidate_id,
            SUM(ed.votes)::integer AS votes
          FROM electoral_data ed
          JOIN municipalities m ON m.id = ed.municipality_id
          ${territory.joins}
          WHERE ed.upload_id = $1
            AND ed.campaign_id = $2
            AND (${territory.where})
          GROUP BY
            ed.campaign_id,
            ed.upload_id,
            ed.election_year,
            ed.election_code,
            ed.round,
            ${territory.partitionScope},
            ed.office_id,
            ed.party_id,
            ed.candidate_id
        ),
        enriched AS (
          SELECT
            grouped.*,
            SUM(votes) OVER (
              PARTITION BY campaign_id, upload_id, election_year, election_code, round, ${territory.partitionScope}, office_id
            )::integer AS total_votes
          FROM grouped
        )
        INSERT INTO territorial_vote_summaries (
          campaign_id,
          upload_id,
          election_year,
          election_code,
          round,
          territory_level,
          municipality_id,
          electoral_zone_id,
          section_id,
          neighborhood_id,
          territorial_region_id,
          office_id,
          party_id,
          candidate_id,
          votes,
          total_votes,
          vote_share
        )
        SELECT
          campaign_id,
          upload_id,
          election_year,
          election_code,
          round,
          $3::"TerritoryLevel",
          municipality_id,
          electoral_zone_id,
          section_id,
          neighborhood_id,
          territorial_region_id,
          office_id,
          party_id,
          candidate_id,
          votes,
          total_votes,
          CASE WHEN total_votes > 0 THEN ROUND((votes::numeric / total_votes::numeric) * 100, 5) ELSE NULL END
        FROM enriched
        `,
        [uploadId, campaignId, territory.level]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
