import { getPrisma } from "@/lib/prisma";

export async function createElectoralUpload(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  fileName: string;
  fileSize: bigint;
  storagePath: string;
  checksum?: string;
}) {
  return getPrisma().electoralUpload.create({
    data: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      storagePath: input.storagePath,
      checksum: input.checksum,
      status: "UPLOADED",
      metadata: {
        source: "TSE",
        state: "PR",
        importer: "streaming-worker"
      }
    }
  });
}

export async function listUploads(organizationId: string) {
  return getPrisma().electoralUpload.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 30
  });
}
