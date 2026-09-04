import Decimal from "decimal.js";
import { AppError } from "@/domain/errors";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

export function nextReservedUsdt(
  used: string,
  reserved: string,
  add: string,
  dailyLimit: string,
) {
  const usedDec = new Decimal(used);
  const reservedDec = new Decimal(reserved);
  const addDec = new Decimal(add);
  const limit = new Decimal(dailyLimit);
  if (addDec.lt(0))
    throw new AppError("DAILY_QUOTA", "预留额度不能为负。", 422);
  if (usedDec.plus(reservedDec).plus(addDec).gt(limit))
    throw new AppError(
      "DAILY_QUOTA",
      "已超过每个 UTC 自然日的执行额度。",
      429,
    );
  return reservedDec.plus(addDec).toFixed(8);
}

export function nextSettledLedger(
  used: string,
  reserved: string,
  release: string,
  consume: boolean,
) {
  const nextReserved = Decimal.max(
    0,
    new Decimal(reserved).minus(release),
  ).toFixed(8);
  const nextUsed = consume
    ? new Decimal(used).plus(release).toFixed(8)
    : new Decimal(used).toFixed(8);
  return { reservedUsdt: nextReserved, usedUsdt: nextUsed };
}
