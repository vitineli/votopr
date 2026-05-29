import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { Pool } from "pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeText } from "../src/lib/utils";
import {
  detectCandidateKind,
  getRowLatitude,
  getRowLongitude,
  getRowNeighborhood,
  parseTseDate,
  parseTseDateTime,
  tseVoteRowSchema,
  type TseVoteRow
} from "../src/services/tse-vote-row";
import { detectTseCsvStructure, mapTseRow } from "../src/services/pipeline/tse-schema";
import { getMunicipalityRegion, PARANA_STATE, PRIORITY_MUNICIPALITY_NAMES } from "../src/services/pipeline/region-scope";
import { rebuildAnalyticsForUpload } from "../src/services/analytics/rebuild";

type Args = {
  file: string;
  uploadId?: string;
  campaignId?: string;
  onlyCandidates: Set<string> | null;
  batchSize: number;
  errorSampleSize: number;
  rebuildAnalytics: boolean;
};

type BufferedVoteRow = {
  tse_code: number;
  municipality_name: string;
  municipality_normalized: string;
  state: string;
  region: string;
  is_priority: boolean;
  zone_number: number;
  section_number: number;
  voting_place_number: number;
  voting_place_name: string;
  address: string;
  neighborhood_name: string | null;
  neighborhood_normalized: string | null;
  latitude: number | null;
  longitude: number | null;
  office_code: number;
  office_name: string;
  office_normalized: string;
  party_acronym: string | null;
  party_number: number | null;
  party_name: string | null;
  party_normalized: string | null;
  election_year: number;
  ballot_number: number;
  candidate_seq: string;
  candidate_name: string;
  candidate_normalized: string;
  candidate_kind: string;
  election_code: number;
  round: number;
  votes: number;
  election_date: string;
  generated_at: string;
};

type ImportErrorBuffer = {
  rowNumber: number;
  code: string;
  message: string;
  rawRow: Record<string, unknown>;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const file = get("file");
  const uploadId = get("upload-id");
  const campaignId = get("campaign-id");
  const onlyCandidates = parseCandidateFilter(get("only-candidates"));

  if (!file || (!uploadId && !campaignId)) {
    throw new Error(
      'Uso: npm run import:tse -- --file "D:\\Votacao\\votacao_secao_2022_PR.csv" --campaign-id "<uuid>" ou --upload-id "<uuid>"'
    );
  }

  return {
    file,
    uploadId,
    campaignId,
    onlyCandidates,
    batchSize: Number(get("batch-size") ?? process.env.IMPORT_BATCH_SIZE ?? 20000),
    errorSampleSize: Number(get("error-sample-size") ?? process.env.IMPORT_ERROR_SAMPLE_SIZE ?? 250),
    rebuildAnalytics: get("rebuild-analytics") !== "false"
  };
}

function parseCandidateFilter(value: string | undefined) {
  if (!value) return null;

  const candidates = value
    .split(/[;,]/)
    .map((candidate) => normalizeText(candidate))
    .filter(Boolean);

  return candidates.length > 0 ? new Set(candidates) : null;
}

function jsonMetadata(input: Prisma.InputJsonValue) {
  return input;
}

function createProgressMetadata(input: {
  structure: Awaited<ReturnType<typeof detectTseCsvStructure>>;
  startedAt: number;
  processedRows: number;
  failedRows: number;
  skippedRows: number;
  rowNumber: number;
  sourceFile: string;
  mode: "created-from-campaign" | "existing-upload";
  candidateFilter: string[] | null;
}) {
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - input.startedAt) / 1000));

  return jsonMetadata({
    parser: "tse-section-votes-v2",
    source: "TSE",
    state: "PR",
    importer: "local-streaming-worker",
    mode: input.mode,
    sourceFile: input.sourceFile,
    csv: {
      encoding: input.structure.encoding,
      delimiter: input.structure.delimiter,
      columns: input.structure.header,
      optionalPresent: input.structure.optionalPresent
    },
    progress: {
      elapsedSeconds,
      rowsPerSecond: Math.round(input.processedRows / elapsedSeconds),
      processedRows: input.processedRows,
      failedRows: input.failedRows,
      skippedRows: input.skippedRows,
      observedRows: input.rowNumber
    },
    filters: {
      candidates: input.candidateFilter
    }
  });
}

async function resolveOrCreateUpload(prisma: PrismaClient, args: Args) {
  if (args.uploadId) {
    const upload = await prisma.electoralUpload.findUniqueOrThrow({
      where: { id: args.uploadId },
      select: { id: true, campaignId: true, organizationId: true }
    });

    return {
      ...upload,
      mode: "existing-upload" as const
    };
  }

  const fileStat = await fs.promises.stat(args.file);
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: args.campaignId! },
    select: {
      id: true,
      organizationId: true,
      organization: {
        select: {
          members: { select: { userId: true, role: true, createdAt: true } }
        }
      }
    }
  });

  const owner = campaign.organization.members.find((member) => member.role === "OWNER");
  const firstMember = [...campaign.organization.members]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0];
  const userId = owner?.userId ?? firstMember?.userId;

  if (!userId) {
    throw new Error("Campanha sem membro associado. Nao foi possivel definir user_id para electoral_uploads.");
  }

  const fileName = path.basename(args.file);
  const upload = await prisma.electoralUpload.create({
    data: {
      organizationId: campaign.organizationId,
      campaignId: campaign.id,
      userId,
      fileName,
      fileSize: BigInt(fileStat.size),
      storagePath: `local/${campaign.organizationId}/${campaign.id}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9_.-]/g, "_")}`,
      status: "UPLOADED",
      metadata: {
        source: "TSE",
        state: "PR",
        importer: "local-streaming-worker",
        sourceFile: args.file
      }
    },
    select: { id: true, campaignId: true, organizationId: true }
  });

  return {
    ...upload,
    mode: "created-from-campaign" as const
  };
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toBufferedRow(row: TseVoteRow): BufferedVoteRow {
  const municipalityNormalized = normalizeText(row.NM_MUNICIPIO);
  const neighborhood = getRowNeighborhood(row);
  const partyAcronym = row.SG_PARTIDO ? normalizeText(row.SG_PARTIDO) : null;
  const latitude = getRowLatitude(row);
  const longitude = getRowLongitude(row);

  return {
    tse_code: row.CD_MUNICIPIO,
    municipality_name: row.NM_MUNICIPIO,
    municipality_normalized: municipalityNormalized,
    state: row.SG_UF,
    region: getMunicipalityRegion(row.NM_MUNICIPIO),
    is_priority: PRIORITY_MUNICIPALITY_NAMES.has(municipalityNormalized),
    zone_number: row.NR_ZONA,
    section_number: row.NR_SECAO,
    voting_place_number: row.NR_LOCAL_VOTACAO,
    voting_place_name: row.NM_LOCAL_VOTACAO,
    address: row.DS_LOCAL_VOTACAO_ENDERECO,
    neighborhood_name: neighborhood ?? null,
    neighborhood_normalized: neighborhood ? normalizeText(neighborhood) : null,
    latitude: typeof latitude === "number" ? latitude : null,
    longitude: typeof longitude === "number" ? longitude : null,
    office_code: row.CD_CARGO,
    office_name: row.DS_CARGO,
    office_normalized: normalizeText(row.DS_CARGO),
    party_acronym: partyAcronym,
    party_number: row.NR_PARTIDO ?? null,
    party_name: row.NM_PARTIDO ?? null,
    party_normalized: row.NM_PARTIDO ? normalizeText(row.NM_PARTIDO) : partyAcronym,
    election_year: row.ANO_ELEICAO,
    ballot_number: row.NR_VOTAVEL,
    candidate_seq: row.SQ_CANDIDATO.toString(),
    candidate_name: row.NM_VOTAVEL,
    candidate_normalized: normalizeText(row.NM_VOTAVEL),
    candidate_kind: detectCandidateKind(row),
    election_code: row.CD_ELEICAO,
    round: row.NR_TURNO,
    votes: row.QT_VOTOS,
    election_date: toDateOnly(parseTseDate(row.DT_ELEICAO)),
    generated_at: parseTseDateTime(row.DT_GERACAO, row.HH_GERACAO).toISOString()
  };
}

function sanitizeRawRow(rawRow: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(rawRow)
      .slice(0, 60)
      .map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value])
  );
}

async function recordImportErrors(prisma: PrismaClient, uploadId: string, errors: ImportErrorBuffer[]) {
  if (errors.length === 0) return;

  await prisma.electoralImportError.createMany({
    data: errors.map((error) => ({
      uploadId,
      rowNumber: error.rowNumber,
      code: error.code,
      message: error.message,
      rawRow: sanitizeRawRow(error.rawRow) as Prisma.InputJsonValue
    }))
  });
}

async function flushBatch(pool: Pool, uploadId: string, campaignId: string, rows: BufferedVoteRow[]) {
  if (rows.length === 0) return;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
      WITH rows AS (
        SELECT DISTINCT tse_code, municipality_name, municipality_normalized, state, region, is_priority
        FROM jsonb_to_recordset($1::jsonb) AS r(
          tse_code int,
          municipality_name text,
          municipality_normalized text,
          state text,
          region text,
          is_priority boolean
        )
      )
      INSERT INTO municipalities (tse_code, name, normalized, state, region, is_priority)
      SELECT tse_code, municipality_name, municipality_normalized, state, region, is_priority
      FROM rows
      ON CONFLICT (tse_code) DO UPDATE SET
        name = EXCLUDED.name,
        normalized = EXCLUDED.normalized,
        state = EXCLUDED.state,
        region = EXCLUDED.region,
        is_priority = EXCLUDED.is_priority
      `,
      [JSON.stringify(rows)]
    );

    await client.query(
      `
      WITH rows AS (
        SELECT DISTINCT office_code, office_name, office_normalized
        FROM jsonb_to_recordset($1::jsonb) AS r(
          office_code int,
          office_name text,
          office_normalized text
        )
      )
      INSERT INTO electoral_offices (code, name, normalized)
      SELECT office_code, office_name, office_normalized
      FROM rows
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        normalized = EXCLUDED.normalized
      `,
      [JSON.stringify(rows)]
    );

    await client.query(
      `
      WITH rows AS (
        SELECT DISTINCT party_acronym, party_number, party_name, party_normalized, election_year
        FROM jsonb_to_recordset($1::jsonb) AS r(
          party_acronym text,
          party_number int,
          party_name text,
          party_normalized text,
          election_year int
        )
        WHERE party_acronym IS NOT NULL AND party_acronym <> ''
      )
      INSERT INTO parties (acronym, number, name, normalized, election_year)
      SELECT party_acronym, party_number, party_name, COALESCE(party_normalized, party_acronym), election_year
      FROM rows
      ON CONFLICT (acronym, election_year) DO UPDATE SET
        number = COALESCE(EXCLUDED.number, parties.number),
        name = COALESCE(EXCLUDED.name, parties.name),
        normalized = EXCLUDED.normalized
      `,
      [JSON.stringify(rows)]
    );

    await client.query(
      `
      WITH rows AS (
        SELECT DISTINCT tse_code, zone_number
        FROM jsonb_to_recordset($1::jsonb) AS r(tse_code int, zone_number int)
      )
      INSERT INTO electoral_zones (municipality_id, number)
      SELECT m.id, rows.zone_number
      FROM rows
      JOIN municipalities m ON m.tse_code = rows.tse_code
      ON CONFLICT (municipality_id, number) DO NOTHING
      `,
      [JSON.stringify(rows)]
    );

    await client.query(
      `
      WITH rows AS (
        SELECT DISTINCT tse_code, neighborhood_name, neighborhood_normalized
        FROM jsonb_to_recordset($1::jsonb) AS r(
          tse_code int,
          neighborhood_name text,
          neighborhood_normalized text
        )
        WHERE neighborhood_name IS NOT NULL AND neighborhood_normalized IS NOT NULL
      )
      INSERT INTO neighborhoods (municipality_id, name, normalized, source)
      SELECT m.id, rows.neighborhood_name, rows.neighborhood_normalized, 'tse_csv'
      FROM rows
      JOIN municipalities m ON m.tse_code = rows.tse_code
      ON CONFLICT (municipality_id, normalized) DO UPDATE SET
        name = EXCLUDED.name,
        source = EXCLUDED.source
      `,
      [JSON.stringify(rows)]
    );

    await client.query(
      `
      WITH rows AS (
        SELECT DISTINCT
          election_year,
          office_code,
          office_name,
          ballot_number,
          candidate_seq::bigint AS candidate_seq,
          candidate_name,
          candidate_normalized,
          candidate_kind::"CandidateKind" AS candidate_kind,
          party_acronym
        FROM jsonb_to_recordset($1::jsonb) AS r(
          election_year int,
          office_code int,
          office_name text,
          ballot_number int,
          candidate_seq text,
          candidate_name text,
          candidate_normalized text,
          candidate_kind text,
          party_acronym text
        )
      )
      INSERT INTO candidates (
        election_year,
        office_id,
        office_code,
        office_name,
        ballot_number,
        candidate_seq,
        name,
        normalized_name,
        kind,
        party_id
      )
      SELECT
        rows.election_year,
        offices.id,
        rows.office_code,
        rows.office_name,
        rows.ballot_number,
        rows.candidate_seq,
        rows.candidate_name,
        rows.candidate_normalized,
        rows.candidate_kind,
        parties.id
      FROM rows
      JOIN electoral_offices offices ON offices.code = rows.office_code
      LEFT JOIN parties
        ON parties.acronym = rows.party_acronym
        AND parties.election_year IS NOT DISTINCT FROM rows.election_year
      ON CONFLICT (election_year, office_code, ballot_number, candidate_seq) DO UPDATE SET
        office_id = EXCLUDED.office_id,
        office_name = EXCLUDED.office_name,
        name = EXCLUDED.name,
        normalized_name = EXCLUDED.normalized_name,
        kind = EXCLUDED.kind,
        party_id = COALESCE(EXCLUDED.party_id, candidates.party_id)
      `,
      [JSON.stringify(rows)]
    );

    await client.query(
      `
      WITH rows AS (
        SELECT DISTINCT
          tse_code,
          zone_number,
          section_number,
          voting_place_number,
          voting_place_name,
          address,
          neighborhood_normalized,
          latitude,
          longitude
        FROM jsonb_to_recordset($1::jsonb) AS r(
          tse_code int,
          zone_number int,
          section_number int,
          voting_place_number int,
          voting_place_name text,
          address text,
          neighborhood_normalized text,
          latitude numeric,
          longitude numeric
        )
      )
      INSERT INTO electoral_sections (
        municipality_id,
        electoral_zone_id,
        neighborhood_id,
        number,
        voting_place_number,
        voting_place_name,
        address,
        neighborhood,
        latitude,
        longitude,
        geom,
        geocoded_at
      )
      SELECT
        m.id,
        z.id,
        n.id,
        rows.section_number,
        rows.voting_place_number,
        rows.voting_place_name,
        rows.address,
        n.name,
        rows.latitude,
        rows.longitude,
        CASE
          WHEN rows.latitude IS NOT NULL AND rows.longitude IS NOT NULL
          THEN ST_SetSRID(ST_MakePoint(rows.longitude, rows.latitude), 4326)
          ELSE NULL
        END,
        CASE
          WHEN rows.latitude IS NOT NULL AND rows.longitude IS NOT NULL
          THEN now()
          ELSE NULL
        END
      FROM rows
      JOIN municipalities m ON m.tse_code = rows.tse_code
      JOIN electoral_zones z ON z.municipality_id = m.id AND z.number = rows.zone_number
      LEFT JOIN neighborhoods n ON n.municipality_id = m.id AND n.normalized = rows.neighborhood_normalized
      ON CONFLICT (municipality_id, electoral_zone_id, number) DO UPDATE SET
        voting_place_number = EXCLUDED.voting_place_number,
        voting_place_name = EXCLUDED.voting_place_name,
        address = EXCLUDED.address,
        neighborhood_id = COALESCE(EXCLUDED.neighborhood_id, electoral_sections.neighborhood_id),
        neighborhood = COALESCE(EXCLUDED.neighborhood, electoral_sections.neighborhood),
        latitude = COALESCE(EXCLUDED.latitude, electoral_sections.latitude),
        longitude = COALESCE(EXCLUDED.longitude, electoral_sections.longitude),
        geom = COALESCE(EXCLUDED.geom, electoral_sections.geom),
        geocoded_at = COALESCE(EXCLUDED.geocoded_at, electoral_sections.geocoded_at)
      `,
      [JSON.stringify(rows)]
    );

    await client.query(
      `
      WITH rows AS (
        SELECT *
        FROM jsonb_to_recordset($3::jsonb) AS r(
          tse_code int,
          zone_number int,
          section_number int,
          office_code int,
          party_acronym text,
          election_year int,
          ballot_number int,
          candidate_seq text,
          election_code int,
          round int,
          votes int,
          election_date date,
          generated_at timestamptz
        )
      )
      INSERT INTO electoral_data (
        upload_id,
        campaign_id,
        municipality_id,
        electoral_zone_id,
        section_id,
        candidate_id,
        office_id,
        party_id,
        election_year,
        election_code,
        round,
        office_code,
        votes,
        election_date,
        generated_at
      )
      SELECT
        $1::uuid,
        $2::uuid,
        m.id,
        z.id,
        s.id,
        c.id,
        o.id,
        p.id,
        rows.election_year,
        rows.election_code,
        rows.round,
        rows.office_code,
        rows.votes,
        rows.election_date,
        rows.generated_at
      FROM rows
      JOIN municipalities m ON m.tse_code = rows.tse_code
      JOIN electoral_zones z ON z.municipality_id = m.id AND z.number = rows.zone_number
      JOIN electoral_sections s ON s.municipality_id = m.id AND s.electoral_zone_id = z.id AND s.number = rows.section_number
      JOIN electoral_offices o ON o.code = rows.office_code
      JOIN candidates c
        ON c.election_year = rows.election_year
        AND c.office_code = rows.office_code
        AND c.ballot_number = rows.ballot_number
        AND c.candidate_seq = rows.candidate_seq::bigint
      LEFT JOIN parties p
        ON p.acronym = rows.party_acronym
        AND p.election_year IS NOT DISTINCT FROM rows.election_year
      `,
      [uploadId, campaignId, JSON.stringify(rows)]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const args = parseArgs();
  const prisma = new PrismaClient();
  const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  let uploadForFailure: Awaited<ReturnType<typeof resolveOrCreateUpload>> | null = null;

  try {
    const upload = await resolveOrCreateUpload(prisma, args);
    uploadForFailure = upload;
    const structure = await detectTseCsvStructure(args.file);

    if (structure.missingRequired.length > 0) {
      throw new Error(`CSV TSE invalido. Colunas obrigatorias ausentes: ${structure.missingRequired.join(", ")}`);
    }

    await prisma.$transaction([
      prisma.electoralData.deleteMany({ where: { uploadId: upload.id } }),
      prisma.territorialVoteSummary.deleteMany({ where: { uploadId: upload.id } }),
      prisma.electoralImportError.deleteMany({ where: { uploadId: upload.id } }),
      prisma.electoralUpload.update({
        where: { id: upload.id },
        data: {
          status: "PROCESSING",
          processedRows: 0,
          failedRows: 0,
          totalRows: 0,
          errorMessage: null,
          startedAt: new Date(),
          completedAt: null,
          metadata: createProgressMetadata({
            structure,
            startedAt: Date.now(),
            processedRows: 0,
            failedRows: 0,
            skippedRows: 0,
            rowNumber: 0,
            sourceFile: args.file,
            mode: upload.mode,
            candidateFilter: args.onlyCandidates ? [...args.onlyCandidates] : null
          })
        }
      })
    ]);

    let processedRows = 0;
    let failedRows = 0;
    let skippedRows = 0;
    let rowNumber = 1;
    const buffer: BufferedVoteRow[] = [];
    const importErrors: ImportErrorBuffer[] = [];
    const startedAt = Date.now();
    const streamEncoding = structure.encoding === "utf8" || structure.encoding === "utf8-bom" ? "utf8" : "latin1";

    console.info(`[import:tse] upload=${upload.id} campaign=${upload.campaignId} file="${args.file}"`);
    console.info(`[import:tse] encoding=${structure.encoding} delimiter="${structure.delimiter}" batchSize=${args.batchSize}`);
    if (args.onlyCandidates) {
      console.info(`[import:tse] candidateFilter=${[...args.onlyCandidates].join(" | ")}`);
    }

    async function flush() {
      if (buffer.length === 0) return;
      await flushBatch(pool, upload.id, upload.campaignId, buffer.splice(0, buffer.length));
      await recordImportErrors(prisma, upload.id, importErrors.splice(0, importErrors.length));
      await prisma.electoralUpload.update({
        where: { id: upload.id },
        data: {
          processedRows,
          failedRows,
          totalRows: processedRows + failedRows,
          metadata: createProgressMetadata({
            structure,
            startedAt,
            processedRows,
            failedRows,
            skippedRows,
            rowNumber,
            sourceFile: args.file,
            mode: upload.mode,
            candidateFilter: args.onlyCandidates ? [...args.onlyCandidates] : null
          })
        }
      });

      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      console.info(
        `[import:tse] rows=${rowNumber - 1} processed=${processedRows} skipped=${skippedRows} failed=${failedRows} rate=${Math.round(
          processedRows / elapsedSeconds
        )}/s`
      );
    }

    const parser = fs.createReadStream(args.file).pipe(
      parse({
        columns: true,
        delimiter: structure.delimiter,
        bom: structure.encoding === "utf8-bom",
        quote: '"',
        relax_quotes: true,
        encoding: streamEncoding,
        skip_empty_lines: true
      })
    );

    for await (const rawRow of parser) {
      rowNumber++;
      const mapped = mapTseRow(rawRow, structure.columnMap);
      const parsed = tseVoteRowSchema.safeParse(mapped);

      if (!parsed.success) {
        failedRows++;
        if (importErrors.length < args.errorSampleSize) {
          importErrors.push({
            rowNumber,
            code: "TSE_ROW_VALIDATION",
            message: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
            rawRow: mapped
          });
        }
        continue;
      }

      if (parsed.data.SG_UF !== PARANA_STATE) {
        skippedRows++;
        continue;
      }

      if (args.onlyCandidates && !args.onlyCandidates.has(normalizeText(parsed.data.NM_VOTAVEL))) {
        skippedRows++;
        continue;
      }

      buffer.push(toBufferedRow(parsed.data));
      processedRows++;

      if (buffer.length >= args.batchSize) {
        await flush();
      }
    }

    await flush();

    if (args.rebuildAnalytics) {
      console.info(`[import:tse] rebuilding analytics for upload=${upload.id}`);
      await rebuildAnalyticsForUpload(pool, upload.id, upload.campaignId);
    }

    await prisma.electoralUpload.update({
      where: { id: upload.id },
      data: {
        status: "COMPLETED",
        processedRows,
        failedRows,
        totalRows: processedRows + failedRows,
        completedAt: new Date(),
        metadata: createProgressMetadata({
          structure,
          startedAt,
          processedRows,
          failedRows,
          skippedRows,
          rowNumber,
          sourceFile: args.file,
          mode: upload.mode,
          candidateFilter: args.onlyCandidates ? [...args.onlyCandidates] : null
        })
      }
    });

    console.info(`[import:tse] completed upload=${upload.id} processed=${processedRows} skipped=${skippedRows} failed=${failedRows}`);
  } catch (error) {
    if (uploadForFailure) {
      await prisma.electoralUpload.update({
        where: { id: uploadForFailure.id },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Falha desconhecida",
          completedAt: new Date()
        }
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
