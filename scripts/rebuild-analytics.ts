import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { rebuildAnalyticsForUpload } from "../src/services/analytics/rebuild";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const uploadId = get("upload-id");

  if (!uploadId) {
    throw new Error('Uso: npm run analytics:rebuild -- --upload-id "<uuid>"');
  }

  return { uploadId };
}

async function main() {
  const args = parseArgs();
  const prisma = new PrismaClient();
  const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

  try {
    const upload = await prisma.electoralUpload.findUniqueOrThrow({
      where: { id: args.uploadId },
      select: { id: true, campaignId: true }
    });

    await rebuildAnalyticsForUpload(pool, upload.id, upload.campaignId);
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
