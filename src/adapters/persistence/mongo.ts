import { MongoClient, type Db } from "mongodb";
import { config } from "@/platform/config";
import {
  existingIndexCovers,
  isEquivalentIndexConflict,
  schemaIndexes,
} from "./indexes";

const globalDb = globalThis as typeof globalThis & {
  baoMongo?: Promise<MongoClient>;
  baoIndexes?: Promise<void>;
};

export async function ensureIndexes(db: Db) {
  const grouped = new Map<string, (typeof schemaIndexes)[number][]>();
  for (const index of schemaIndexes) {
    const list = grouped.get(index.collection) ?? [];
    list.push(index);
    grouped.set(index.collection, list);
  }
  await Promise.all(
    [...grouped].map(async ([collection, specs]) => {
      const col = db.collection(collection);
      const existing = await col.indexes();
      await Promise.all(
        specs.map(async (index) => {
          if (existing.some((item) => existingIndexCovers(item, index))) return;
          try {
            await col.createIndex(index.keys, index.options);
          } catch (error) {
            if (!isEquivalentIndexConflict(error)) throw error;
          }
        }),
      );
    }),
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
