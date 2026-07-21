import { describe, expect, it } from "vitest";
import { facilities } from "../data/catalog";
import { filterByScope } from "./model";
import { summarizeHardwareStock } from "./compute";

describe("hardware stock model", () => {
  it("uses only evidence available by the selected as-of date", () => {
    const records = filterByScope(facilities, "qualified-ai");
    const may = summarizeHardwareStock(records, "2026-05-31");
    const december = summarizeHardwareStock(records, "2026-12-31");
    expect(december.totalAccelerators).toBeGreaterThanOrEqual(may.totalAccelerators);
    expect(may.latestEvidenceDate! <= "2026-05-31").toBe(true);
  });

  it("retains generation-level units rather than treating all chips as H100s", () => {
    const summary = summarizeHardwareStock(facilities);
    expect(summary.totalAccelerators).toBeGreaterThan(0);
    expect(summary.byGeneration.length).toBeGreaterThan(1);
    expect(summary.byGeneration.every((row) => row.chipType.length > 0 && row.units > 0)).toBe(true);
    expect(summary.provenance).toBe("Estimated");
  });
});
