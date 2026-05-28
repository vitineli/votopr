import fs from "node:fs/promises";

export const TSE_REQUIRED_COLUMNS = [
  "DT_GERACAO",
  "HH_GERACAO",
  "ANO_ELEICAO",
  "CD_TIPO_ELEICAO",
  "NM_TIPO_ELEICAO",
  "NR_TURNO",
  "CD_ELEICAO",
  "DS_ELEICAO",
  "DT_ELEICAO",
  "TP_ABRANGENCIA",
  "SG_UF",
  "SG_UE",
  "NM_UE",
  "CD_MUNICIPIO",
  "NM_MUNICIPIO",
  "NR_ZONA",
  "NR_SECAO",
  "CD_CARGO",
  "DS_CARGO",
  "NR_VOTAVEL",
  "NM_VOTAVEL",
  "QT_VOTOS",
  "NR_LOCAL_VOTACAO",
  "SQ_CANDIDATO",
  "NM_LOCAL_VOTACAO",
  "DS_LOCAL_VOTACAO_ENDERECO"
] as const;

export const TSE_OPTIONAL_COLUMNS = [
  "NR_PARTIDO",
  "SG_PARTIDO",
  "NM_PARTIDO",
  "DS_BAIRRO",
  "NM_BAIRRO",
  "NR_LATITUDE",
  "NR_LONGITUDE",
  "LATITUDE",
  "LONGITUDE"
] as const;

type CanonicalColumn = (typeof TSE_REQUIRED_COLUMNS)[number] | (typeof TSE_OPTIONAL_COLUMNS)[number];

const aliases: Record<CanonicalColumn, string[]> = {
  DT_GERACAO: ["DT_GERACAO"],
  HH_GERACAO: ["HH_GERACAO"],
  ANO_ELEICAO: ["ANO_ELEICAO"],
  CD_TIPO_ELEICAO: ["CD_TIPO_ELEICAO"],
  NM_TIPO_ELEICAO: ["NM_TIPO_ELEICAO"],
  NR_TURNO: ["NR_TURNO"],
  CD_ELEICAO: ["CD_ELEICAO"],
  DS_ELEICAO: ["DS_ELEICAO"],
  DT_ELEICAO: ["DT_ELEICAO"],
  TP_ABRANGENCIA: ["TP_ABRANGENCIA"],
  SG_UF: ["SG_UF"],
  SG_UE: ["SG_UE"],
  NM_UE: ["NM_UE"],
  CD_MUNICIPIO: ["CD_MUNICIPIO"],
  NM_MUNICIPIO: ["NM_MUNICIPIO"],
  NR_ZONA: ["NR_ZONA"],
  NR_SECAO: ["NR_SECAO"],
  CD_CARGO: ["CD_CARGO"],
  DS_CARGO: ["DS_CARGO"],
  NR_VOTAVEL: ["NR_VOTAVEL"],
  NM_VOTAVEL: ["NM_VOTAVEL"],
  QT_VOTOS: ["QT_VOTOS"],
  NR_LOCAL_VOTACAO: ["NR_LOCAL_VOTACAO"],
  SQ_CANDIDATO: ["SQ_CANDIDATO"],
  NM_LOCAL_VOTACAO: ["NM_LOCAL_VOTACAO"],
  DS_LOCAL_VOTACAO_ENDERECO: ["DS_LOCAL_VOTACAO_ENDERECO", "DS_ENDERECO"],
  NR_PARTIDO: ["NR_PARTIDO"],
  SG_PARTIDO: ["SG_PARTIDO"],
  NM_PARTIDO: ["NM_PARTIDO"],
  DS_BAIRRO: ["DS_BAIRRO"],
  NM_BAIRRO: ["NM_BAIRRO"],
  NR_LATITUDE: ["NR_LATITUDE"],
  NR_LONGITUDE: ["NR_LONGITUDE"],
  LATITUDE: ["LATITUDE"],
  LONGITUDE: ["LONGITUDE"]
};

export type TseCsvStructure = {
  encoding: "utf8-bom" | "utf8" | "latin1";
  delimiter: ";" | "," | "\t";
  header: string[];
  columnMap: Partial<Record<CanonicalColumn, string>>;
  missingRequired: string[];
  optionalPresent: string[];
  sampleBytes: number;
};

function decodeHeader(buffer: Buffer) {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { encoding: "utf8-bom" as const, text: buffer.toString("utf8").replace(/^\uFEFF/, "") };
  }

  const utf8Text = buffer.toString("utf8");
  if (!utf8Text.includes("\uFFFD")) {
    return { encoding: "utf8" as const, text: utf8Text };
  }

  return { encoding: "latin1" as const, text: buffer.toString("latin1") };
}

function detectDelimiter(headerLine: string) {
  const candidates = [";", ",", "\t"] as const;
  return candidates
    .map((delimiter) => ({ delimiter, columns: splitHeader(headerLine, delimiter).length }))
    .sort((a, b) => b.columns - a.columns)[0].delimiter;
}

function splitHeader(headerLine: string, delimiter: string) {
  return headerLine
    .split(delimiter)
    .map((column) => column.trim().replace(/^"|"$/g, ""));
}

export async function detectTseCsvStructure(filePath: string, sampleBytes = 64 * 1024): Promise<TseCsvStructure> {
  const handle = await fs.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(sampleBytes);
    const { bytesRead } = await handle.read(buffer, 0, sampleBytes, 0);
    const sample = buffer.subarray(0, bytesRead);
    const decoded = decodeHeader(sample);
    const firstLine = decoded.text.split(/\r?\n/)[0] ?? "";
    const delimiter = detectDelimiter(firstLine);
    const header = splitHeader(firstLine, delimiter);
    const headerSet = new Set(header);
    const columnMap: Partial<Record<CanonicalColumn, string>> = {};

    for (const canonical of [...TSE_REQUIRED_COLUMNS, ...TSE_OPTIONAL_COLUMNS]) {
      const found = aliases[canonical].find((alias) => headerSet.has(alias));
      if (found) columnMap[canonical] = found;
    }

    const missingRequired = TSE_REQUIRED_COLUMNS.filter((column) => !columnMap[column]);
    const optionalPresent = TSE_OPTIONAL_COLUMNS.filter((column) => Boolean(columnMap[column]));

    return {
      encoding: decoded.encoding,
      delimiter,
      header,
      columnMap,
      missingRequired,
      optionalPresent,
      sampleBytes: bytesRead
    };
  } finally {
    await handle.close();
  }
}

export function mapTseRow(rawRow: Record<string, unknown>, columnMap: TseCsvStructure["columnMap"]) {
  const mapped: Record<string, unknown> = {};

  for (const [canonical, actual] of Object.entries(columnMap)) {
    if (actual) mapped[canonical] = rawRow[actual];
  }

  return mapped;
}
