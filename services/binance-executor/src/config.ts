import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().default(8080),
  EXECUTOR_AUDIENCE: z.string().url(),
  KMS_KEY_RESOURCE: z.string().min(8),
  BINANCE_PRODUCTION_REST: z.string().url().default("https://api.binance.com"),
  BINANCE_TESTNET_REST: z
    .string()
    .url()
    .default("https://testnet.binance.vision"),
  HARD_ACTION_MAX_USDT: z.coerce.number().positive().max(5).default(5),
  HARD_ACTION_DAILY_MAX_USDT: z.coerce.number().positive().max(20).default(20),
});

export function executorConfig() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error("executor config missing");
  return parsed.data;
}
