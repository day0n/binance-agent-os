import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import type {
  ActionKind,
  ActionRecord,
  ActionStatus,
  ActionDraft,
  ActionProposalPreview,
} from "@/domain/actions";
import { AppError } from "@/domain/errors";
import { database } from "./mongo";

export type ActionDoc = Omit<ActionRecord, "id"> & { _id: string };
export type ConfirmationDoc = {
  _id: string;
  userId: string;
  actionId: string;
  proposalHash: string;
  consumedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
};
export type DailyLedgerDoc = {
  _id: string;
  userId: string;
  utcDate: string;
  usedUsdt: string;
  reservedUsdt: string;
};

function asAction(doc: ActionDoc): ActionRecord {
  return { ...doc, id: doc._id };
}

export async function insertAction(input: {
  userId: string;
  sessionId: string;
  runId: string;
  kind: ActionKind;
  draft: ActionDraft;
  proposal?: ActionProposalPreview;
  proposalHash?: string;
  clientOrderId?: string;
  environment?: ActionRecord["environment"];
  connectionId?: string;
  reservedUsdt: string;
  expiresAt: Date;
}) {
  const now = new Date();
  const doc: ActionDoc = {
    _id: randomUUID(),
    status: "awaiting_confirmation",
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  await (await database()).collection<ActionDoc>("actions").insertOne(doc);
  return asAction(doc);
}

export async function getAction(id: string, userId: string) {
  const doc = await (await database())
    .collection<ActionDoc>("actions")
    .findOne({ _id: id, userId });
  if (!doc) throw new AppError("NOT_FOUND", "动作不存在。", 404);
  return asAction(doc);
}

export async function casActionStatus(
  id: string,
  userId: string,
  from: ActionStatus | ActionStatus[],
  to: ActionStatus,
  extra?: Partial<ActionDoc>,
) {
  const allowed = Array.isArray(from) ? from : [from];
  const result = await (
    await database()
  )
    .collection<ActionDoc>("actions")
    .findOneAndUpdate(
      { _id: id, userId, status: { $in: allowed } },
      { $set: { status: to, updatedAt: new Date(), ...extra } },
      { returnDocument: "after" },
    );
  if (!result) throw new AppError("ACTION_STATE", "动作状态已变化，请刷新。", 409);
  return asAction(result);
}

export async function insertConfirmation(input: {
  userId: string;
  actionId: string;
  proposalHash: string;
  expiresAt: Date;
}) {
  const doc: ConfirmationDoc = {
    _id: randomUUID(),
    createdAt: new Date(),
    ...input,
  };
  try {
    await (await database())
      .collection<ConfirmationDoc>("action_confirmations")
      .insertOne(doc);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    )
      throw new AppError("CONFIRMATION_EXISTS", "该动作已确认。", 409);
    throw error;
  }
  return doc;
}

export async function consumeConfirmation(
  actionId: string,
  userId: string,
  proposalHash: string,
) {
  const result = await (
    await database()
  )
    .collection<ConfirmationDoc>("action_confirmations")
    .findOneAndUpdate(
      {
        actionId,
        userId,
        proposalHash,
        consumedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      },
      { $set: { consumedAt: new Date() } },
      { returnDocument: "after" },
    );
  if (!result)
    throw new AppError("CONFIRMATION_INVALID", "确认已过期或已使用。", 409);
  return result;
}

export function utcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export async function getDailyLedger(userId: string, date = utcDate()) {
  const doc = await (await database())
    .collection<DailyLedgerDoc>("daily_action_ledger")
    .findOne({ userId, utcDate: date });
  return (
    doc ?? {
      _id: `${userId}:${date}`,
      userId,
      utcDate: date,
      usedUsdt: "0",
      reservedUsdt: "0",
    }
  );
}

export async function reserveDailyQuota(
  userId: string,
  amount: string,
  dailyLimit: string,
) {
  const date = utcDate();
  const db = await database();
  const current = await getDailyLedger(userId, date);
  const used = new Decimal(current.usedUsdt);
  const reserved = new Decimal(current.reservedUsdt);
  const add = new Decimal(amount);
  const limit = new Decimal(dailyLimit);
  if (used.plus(reserved).plus(add).gt(limit))
    throw new AppError(
      "DAILY_QUOTA",
      "已超过每个 UTC 自然日的执行额度。",
      429,
    );
  await db.collection<DailyLedgerDoc>("daily_action_ledger").updateOne(
    { userId, utcDate: date },
    {
      $setOnInsert: {
        _id: `${userId}:${date}`,
        userId,
        utcDate: date,
        usedUsdt: "0",
      },
      $set: {
        reservedUsdt: reserved.plus(add).toFixed(8),
      },
    },
    { upsert: true },
  );
}

export async function settleDailyQuota(
  userId: string,
  reserved: string,
  consume: boolean,
) {
  const date = utcDate();
  const current = await getDailyLedger(userId, date);
  const nextReserved = Decimal.max(
    0,
    new Decimal(current.reservedUsdt).minus(reserved),
  );
  const nextUsed = consume
    ? new Decimal(current.usedUsdt).plus(reserved)
    : new Decimal(current.usedUsdt);
  await (
    await database()
  )
    .collection<DailyLedgerDoc>("daily_action_ledger")
    .updateOne(
      { userId, utcDate: date },
      {
        $set: {
          reservedUsdt: nextReserved.toFixed(8),
          usedUsdt: nextUsed.toFixed(8),
        },
      },
    );
}
