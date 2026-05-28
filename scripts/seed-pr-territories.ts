import { PrismaClient } from "@prisma/client";
import { normalizeText } from "../src/lib/utils";
import { getMunicipalityRegion, PRIORITY_MUNICIPALITY_NAMES } from "../src/services/pipeline/region-scope";

const prisma = new PrismaClient();

const initialMunicipalities = [
  { tseCode: 75353, name: "CURITIBA" },
  { tseCode: 78859, name: "SAO JOSE DOS PINHAIS" },
  { tseCode: 75132, name: "COLOMBO" },
  { tseCode: 74357, name: "ARAUCARIA" },
  { tseCode: 74810, name: "CAMPO LARGO" },
  { tseCode: 74322, name: "FAZENDA RIO GRANDE" },
  { tseCode: 74071, name: "ALMIRANTE TAMANDARE" },
  { tseCode: 75043, name: "PINHAIS" },
  { tseCode: 77690, name: "PIRAQUARA" },
  { tseCode: 76791, name: "MANDIRITUBA" }
];

async function main() {
  await prisma.territorialRegion.upsert({
    where: { level_code: { level: "STATE", code: "PR" } },
    update: { name: "Parana", normalized: "PARANA", source: "ibge" },
    create: { level: "STATE", code: "PR", name: "Parana", normalized: "PARANA", source: "ibge" }
  });

  await prisma.territorialRegion.upsert({
    where: { level_code: { level: "METROPOLITAN_REGION", code: "RMC" } },
    update: {
      name: "Regiao Metropolitana de Curitiba",
      normalized: "REGIAO METROPOLITANA DE CURITIBA",
      source: "amep"
    },
    create: {
      level: "METROPOLITAN_REGION",
      code: "RMC",
      name: "Regiao Metropolitana de Curitiba",
      normalized: "REGIAO METROPOLITANA DE CURITIBA",
      source: "amep"
    }
  });

  for (const municipality of initialMunicipalities) {
    const normalized = normalizeText(municipality.name);

    await prisma.municipality.upsert({
      where: { tseCode: municipality.tseCode },
      update: {
        name: municipality.name,
        normalized,
        region: getMunicipalityRegion(municipality.name),
        state: "PR",
        isPriority: PRIORITY_MUNICIPALITY_NAMES.has(normalized)
      },
      create: {
        tseCode: municipality.tseCode,
        name: municipality.name,
        normalized,
        region: getMunicipalityRegion(municipality.name),
        state: "PR",
        isPriority: PRIORITY_MUNICIPALITY_NAMES.has(normalized)
      }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
