import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().default("VotoPR"),
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("electoral-uploads"),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  IMPORT_BATCH_SIZE: z.coerce.number().int().positive().default(10000),
  IMPORT_TARGET_STATE: z.literal("PR").default("PR"),
  MAP_GEOJSON_CACHE_SECONDS: z.coerce.number().int().min(0).max(3600).default(60)
});

export function getEnv() {
  return envSchema.parse(process.env);
}
