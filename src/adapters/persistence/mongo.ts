import { MongoClient } from "mongodb";
import { config } from "@/platform/config";

const globalDb = globalThis as typeof globalThis & {
  baoMongo?: Promise<MongoClient>;
  baoIndexes?: Promise<void>;
};
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
  globalDb.baoIndexes ??= Promise.all([
    db
      .collection("runs")
      .createIndex({ ownerId: 1, clientRequestId: 1 }, { unique: true }),
    db.collection("runs").createIndex({ ownerId: 1, createdAt: -1 }),
    db.collection("sessions").createIndex({ ownerId: 1, updatedAt: -1 }),
    db
      .collection("messages")
      .createIndex({ ownerId: 1, sessionId: 1, createdAt: 1 }),
    db.collection("artifacts").createIndex({ ownerId: 1, runId: 1 }),
    db
      .collection("oauth_states")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection("memories")
      .createIndex({ ownerId: 1, symbol: 1, availableAt: -1 }),
  ])
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
