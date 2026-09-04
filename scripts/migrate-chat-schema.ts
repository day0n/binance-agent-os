import { MongoClient } from "mongodb";
import { schemaIndexes } from "../src/adapters/persistence/indexes";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const uri = requireEnv("MONGODB_URI");
const dbName = requireEnv("MONGODB_DB");
if (!/^binance_agent_os(?:_[a-z0-9_]+)?$/.test(dbName))
  throw new Error("Refusing to migrate a non-project database.");
if (dbName === "binance_agent_os" && process.env.APP_ENV !== "production")
  throw new Error("Refusing to migrate production database outside production.");

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const planned = schemaIndexes.map((index) => ({
  collection: index.collection,
  name: index.options?.name,
  keys: index.keys,
  options: index.options ?? {},
}));

console.log(
  JSON.stringify(
    {
      database: dbName,
      mode: apply ? "apply" : "dry-run",
      indexes: planned,
      note: "Legacy anonymous sessions stay unread and unclaimed.",
    },
    null,
    2,
  ),
);

if (!dryRun) {
  for (const index of schemaIndexes)
    await db.collection(index.collection).createIndex(index.keys, {
      ...index.options,
    });
  await db.collection<{ _id: string; version: number; appliedAt: Date; indexCount: number }>("schema_meta").updateOne(
    { _id: "chat_schema" },
    {
      $set: {
        version: 1,
        appliedAt: new Date(),
        indexCount: schemaIndexes.length,
      },
    },
    { upsert: true },
  );
}

await client.close();
