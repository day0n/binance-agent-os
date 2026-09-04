import { MongoClient, type Db } from "mongodb";
import { config } from "@/platform/config";
import { schemaIndexes } from "./indexes";

const globalDb = globalThis as typeof globalThis & {
  baoMongo?: Promise<MongoClient>;
  baoIndexes?: Promise<void>;
};

export async function ensureIndexes(db: Db) {
  await Promise.all(
    schemaIndexes.map((index) =>
      db.collection(index.collection).createIndex(index.keys, index.options),
    ),
  );
}

export async function database() {
  const c = config();
  globalDb.baoMongo ??= new MongoClient(c.MONGODB_URI, {
    maxPoolSize: 6,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  })
    .connect()
    .catch((error) => {
      globalDb.baoMongo = undefined;
      throw error;
    });
  const db = (await globalDb.baoMongo).db(c.MONGODB_DB);
  globalDb.baoIndexes ??= ensureIndexes(db)
    .then(() => undefined)
    .catch((error) => {
      globalDb.baoIndexes = undefined;
      throw error;
    });
  await globalDb.baoIndexes;
  return db;
}

export async function closeDatabase() {
  if (globalDb.baoMongo) await (await globalDb.baoMongo).close();
  globalDb.baoMongo = undefined;
  globalDb.baoIndexes = undefined;
}
