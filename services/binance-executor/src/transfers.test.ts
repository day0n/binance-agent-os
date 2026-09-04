import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("internal transfer uncertainty", () => {
  it("does not retry after a transfer exception", () => {
    const source = readFileSync(new URL("./transfers.ts", import.meta.url), "utf8");
    expect(source).toContain("TRANSFER_UNCERTAIN");
    expect(source).toContain("TRANSFER_PRODUCTION_ONLY");
    expect(source).not.toMatch(/for\s*\(|while\s*\(/);
    expect(source).not.toContain("retry");
  });
});
