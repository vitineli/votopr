import { z } from "zod";
import { createElectoralUpload } from "@/repositories/upload-repository";

const MAX_UPLOAD_SIZE_BYTES = BigInt(3 * 1024 * 1024 * 1024);

export const createUploadSchema = z.object({
  campaignId: z.string().uuid(),
  fileName: z.string().min(1).max(260),
  fileSize: z.coerce.bigint().positive(),
  storagePath: z.string().min(1).max(600).regex(/^[a-zA-Z0-9/_ .-]+$/),
  checksum: z.string().regex(/^[a-fA-F0-9]{64}$/).optional()
});

export async function registerUploadedCsv(input: z.infer<typeof createUploadSchema> & {
  organizationId: string;
  userId: string;
}) {
  const parsed = createUploadSchema.parse(input);
  const isCsv = parsed.fileName.toLowerCase().endsWith(".csv");

  if (!isCsv) {
    throw new Error("Somente arquivos CSV do TSE sao aceitos nesta etapa.");
  }

  if (parsed.fileSize > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("Arquivo acima do limite operacional de 3GB para o pipeline MVP.");
  }

  if (parsed.storagePath.includes("..") || parsed.storagePath.startsWith("/")) {
    throw new Error("Caminho de storage invalido.");
  }

  return createElectoralUpload({
    organizationId: input.organizationId,
    campaignId: parsed.campaignId,
    userId: input.userId,
    fileName: parsed.fileName,
    fileSize: parsed.fileSize,
    storagePath: parsed.storagePath,
    checksum: parsed.checksum
  });
}
