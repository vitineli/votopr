import { normalizeText } from "@/lib/utils";

export const PARANA_STATE = "PR";

export const PRIORITY_MUNICIPALITY_NAMES = new Set([
  "CURITIBA",
  "SAO JOSE DOS PINHAIS"
]);

export const RMC_MUNICIPALITY_NAMES = new Set([
  "CURITIBA",
  "ADRIANOPOLIS",
  "AGUDOS DO SUL",
  "ALMIRANTE TAMANDARE",
  "ARAUCARIA",
  "BALSA NOVA",
  "BOCAIUVA DO SUL",
  "CAMPINA GRANDE DO SUL",
  "CAMPO DO TENENTE",
  "CAMPO LARGO",
  "CAMPO MAGRO",
  "CERRO AZUL",
  "COLOMBO",
  "CONTENDA",
  "DOUTOR ULYSSES",
  "FAZENDA RIO GRANDE",
  "ITAPERUCU",
  "LAPA",
  "MANDIRITUBA",
  "PIEN",
  "PINHAIS",
  "PIRAQUARA",
  "QUATRO BARRAS",
  "QUITANDINHA",
  "RIO BRANCO DO SUL",
  "RIO NEGRO",
  "SAO JOSE DOS PINHAIS",
  "TIJUCAS DO SUL",
  "TUNAS DO PARANA"
]);

export function normalizeMunicipalityName(name: string) {
  return normalizeText(name);
}

export function getMunicipalityRegion(name: string) {
  const normalized = normalizeMunicipalityName(name);

  if (PRIORITY_MUNICIPALITY_NAMES.has(normalized)) {
    return "PRIORIDADE_MVP";
  }

  if (RMC_MUNICIPALITY_NAMES.has(normalized)) {
    return "REGIAO_METROPOLITANA_CURITIBA";
  }

  return "PARANA";
}

export function isMvpScopeMunicipality(name: string) {
  const normalized = normalizeMunicipalityName(name);
  return PRIORITY_MUNICIPALITY_NAMES.has(normalized) || RMC_MUNICIPALITY_NAMES.has(normalized);
}
