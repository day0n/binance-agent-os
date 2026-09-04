import { describe, expect, it } from "vitest";
import {
  existingIndexCovers,
  indexKeysEqual,
  isEquivalentIndexConflict,
  type IndexSpec,
} from "@/adapters/persistence/indexes";

const runs: IndexSpec = {
  collection: "runs",
  keys: { ownerId: 1, clientRequestId: 1 },
  options: { unique: true, name: "runs_owner_request" },
};

describe("index compatibility", () => {
  it("treats auto-named equivalent indexes as already applied", () => {
    expect(
      existingIndexCovers(
        {
          name: "ownerId_1_clientRequestId_1",
          key: { ownerId: 1, clientRequestId: 1 },
          unique: true,
        },
        runs,
      ),
    ).toBe(true);
    expect(
      indexKeysEqual(runs.keys, { ownerId: 1, clientRequestId: 1 }),
    ).toBe(true);
  });

  it("rejects a unique mismatch or a different key set", () => {
    expect(
      existingIndexCovers(
        { key: { ownerId: 1, clientRequestId: 1 }, unique: false },
        runs,
      ),
    ).toBe(false);
    expect(
      existingIndexCovers({ key: { ownerId: 1 }, unique: true }, runs),
    ).toBe(false);
  });

  it("ignores Mongo name conflicts but not other index errors", () => {
    expect(
      isEquivalentIndexConflict({
        code: 85,
        message: "Index already exists with a different name: ownerId_1_clientRequestId_1",
      }),
    ).toBe(true);
    expect(
      isEquivalentIndexConflict({
        code: 86,
        message: "IndexKeySpecsConflict",
      }),
    ).toBe(false);
  });
});
