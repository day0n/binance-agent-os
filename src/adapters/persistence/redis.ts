import { createClient } from "redis";
import { randomUUID } from "node:crypto";
import { config } from "@/platform/config";
import { AppError } from "@/domain/errors";

function makeClient() {
  return createClient({
    url: config().REDIS_URL,
    socket: { connectTimeout: 5000, reconnectStrategy: false },
  });
}
type Client = ReturnType<typeof makeClient>;
const globalRedis = globalThis as typeof globalThis & {
  baoRedis?: Promise<Client>;
};
export function redisKey(suffix: string) {
  return `binance-agent:${config().APP_ENV}:${suffix}`;
}
export async function redis() {
  globalRedis.baoRedis ??= (async () => {
    const client = makeClient();
    client.on("error", () => {
      /* Do not log connection strings or server errors. */
    });
    await client.connect();
    return client;
  })().catch((error) => {
    globalRedis.baoRedis = undefined;
    throw error;
  });
  return globalRedis.baoRedis!;
}
export async function rateLimit(
  subject: string,
  limit: number,
  seconds: number,
) {
  const count = Number(
    await (
      await redis()
    ).eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      { keys: [redisKey(`rate:${subject}`)], arguments: [String(seconds)] },
    ),
  );
  if (count > limit)
    throw new AppError("RATE_LIMIT", "请求过于频繁，请稍后再试。", 429);
}
export async function withLease<T>(name: string, fn: () => Promise<T>) {
  const client = await redis();
  const token = randomUUID();
  const key = redisKey(`lease:${name}`);
  if (!(await client.set(key, token, { NX: true, PX: 30000 })))
    throw new AppError("BUSY", "同一请求正在处理，请稍后重试。", 409, true);
  try {
    return await fn();
  } finally {
    await client
      .eval(
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
        { keys: [key], arguments: [token] },
      )
      .catch(() => undefined);
  }
}
export async function notifyRun(runId: string) {
  await (await redis())
    .publish(redisKey(`run:${runId}`), "updated")
    .catch(() => undefined);
}
export async function notifySession(sessionId: string) {
  await (await redis())
    .publish(redisKey(`session:${sessionId}`), "updated")
    .catch(() => undefined);
}
export async function withSessionRunLock<T>(
  userId: string,
  sessionId: string,
  fn: () => Promise<T>,
) {
  return withLease(`session-run:${userId}:${sessionId}`, fn);
}
export async function closeRedis() {
  if (globalRedis.baoRedis) await (await globalRedis.baoRedis).close();
  globalRedis.baoRedis = undefined;
}
