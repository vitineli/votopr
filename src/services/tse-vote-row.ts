import { z } from "zod";
import { normalizeText } from "@/lib/utils";

const optionalNumber = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return value.replace(",", ".");
  return value;
}, z.coerce.number().optional());

const optionalInteger = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  return value;
}, z.coerce.number().int().optional());

export const tseVoteRowSchema = z.object({
  DT_GERACAO: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  HH_GERACAO: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  ANO_ELEICAO: z.coerce.number().int(),
  CD_TIPO_ELEICAO: z.coerce.number().int(),
  NM_TIPO_ELEICAO: z.string(),
  NR_TURNO: z.coerce.number().int(),
  CD_ELEICAO: z.coerce.number().int(),
  DS_ELEICAO: z.string(),
  DT_ELEICAO: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  TP_ABRANGENCIA: z.string(),
  SG_UF: z.string(),
  SG_UE: z.string(),
  NM_UE: z.string(),
  CD_MUNICIPIO: z.coerce.number().int(),
  NM_MUNICIPIO: z.string(),
  NR_ZONA: z.coerce.number().int(),
  NR_SECAO: z.coerce.number().int(),
  CD_CARGO: z.coerce.number().int(),
  DS_CARGO: z.string(),
  NR_VOTAVEL: z.coerce.number().int(),
  NM_VOTAVEL: z.string(),
  QT_VOTOS: z.coerce.number().int().nonnegative(),
  NR_LOCAL_VOTACAO: z.coerce.number().int(),
  SQ_CANDIDATO: z.coerce.bigint(),
  NM_LOCAL_VOTACAO: z.string(),
  DS_LOCAL_VOTACAO_ENDERECO: z.string(),
  NR_PARTIDO: optionalInteger,
  SG_PARTIDO: z.string().optional(),
  NM_PARTIDO: z.string().optional(),
  DS_BAIRRO: z.string().optional(),
  NM_BAIRRO: z.string().optional(),
  NR_LATITUDE: optionalNumber,
  NR_LONGITUDE: optionalNumber,
  LATITUDE: optionalNumber,
  LONGITUDE: optionalNumber
}).passthrough();

export type TseVoteRow = z.infer<typeof tseVoteRowSchema>;

export function parseTseDate(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseTseDateTime(date: string, time: string) {
  const [day, month, year] = date.split("/").map(Number);
  const [hours, minutes, seconds] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

export function detectCandidateKind(row: TseVoteRow) {
  const normalized = normalizeText(row.NM_VOTAVEL);

  if (normalized.includes("VOTO BRANCO") || row.NR_VOTAVEL === 95) return "BLANK" as const;
  if (normalized.includes("VOTO NULO") || row.NR_VOTAVEL === 96 || row.SQ_CANDIDATO === BigInt(-1)) {
    return "NULL" as const;
  }
  if (normalized.includes("LEGENDA") || row.SQ_CANDIDATO === BigInt(-3)) return "PARTY" as const;

  return "CANDIDATE" as const;
}

export function getRowNeighborhood(row: TseVoteRow) {
  return row.DS_BAIRRO || row.NM_BAIRRO || undefined;
}

export function getRowLatitude(row: TseVoteRow) {
  return row.NR_LATITUDE ?? row.LATITUDE;
}

export function getRowLongitude(row: TseVoteRow) {
  return row.NR_LONGITUDE ?? row.LONGITUDE;
}
