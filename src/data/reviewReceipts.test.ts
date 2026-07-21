import { describe, expect, it } from "vitest";
import { createReviewReceipt } from "./reviewReceipts";

describe("local analyst review receipts", () => {
  it("creates deterministic hash-chained draft receipts", async () => {
    const receipt = await createReviewReceipt({
      entityType: "facility",
      entityId: "facility-1",
      decision: "approve-draft",
      reviewerAlias: "AB",
      reason: "Primary evidence and calculation were checked.",
      createdAt: "2026-07-21T12:00:00.000Z",
    }, "a".repeat(64));
    expect(receipt.previousHash).toBe("a".repeat(64));
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.authority).toBe("local-unsigned-draft");
  });

  it("refuses anonymous or explanation-free review actions", async () => {
    await expect(createReviewReceipt({
      entityType: "facility",
      entityId: "facility-1",
      decision: "retain-needs-review",
      reviewerAlias: "A",
      reason: "too short",
      createdAt: "2026-07-21T12:00:00.000Z",
    }, null)).rejects.toThrow(/alias|reason/i);
  });
});
