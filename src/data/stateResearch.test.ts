import { describe, expect, it } from "vitest";
import { STATE_NAMES } from "./states";
import { dataRunRelease, stateContextRelease, statePolicyRelease } from "./stateResearch";

describe("all-state research release", () => {
  it("covers the exact 50-state set including Alaska and Hawaii", () => {
    const expected = Object.keys(STATE_NAMES).sort();
    expect(expected).toHaveLength(50);
    expect(stateContextRelease.states.map((row) => row.state).sort()).toEqual(expected);
    expect(statePolicyRelease.coverage.map((row) => row.state).sort()).toEqual(expected);
    expect(expected).toContain("AK");
    expect(expected).toContain("HI");
  });

  it("retains dates, units-by-contract, provenance, and limitations for every state context row", () => {
    stateContextRelease.states.forEach((row) => {
      expect(row.electricity.retailSalesTwh).toBeGreaterThan(0);
      expect(row.electricity.averageCommercialPriceCentsPerKwh).toBeGreaterThan(0);
      expect(row.electricity.sourceDate).toBe("2024");
      expect(row.water.sourceDate).toBe("2015");
      expect(row.water.freshness).toBe("stale");
      expect(row.water.limitation).toMatch(/not a data-center/i);
      expect(row.drought.sourceDate).toBe("2026-07-14");
      expect(row.drought.d1D4Pct).toBeGreaterThanOrEqual(0);
      expect(row.drought.d1D4Pct).toBeLessThanOrEqual(100);
      expect(row.drought.limitation).toMatch(/not evidence/i);
      expect(row.sources.every((source) => source.provenance === "Reported" && source.url.startsWith("https://"))).toBe(true);
    });
  });

  it("keeps secondary policy discoveries model-inactive and distinct from legal review", () => {
    expect(statePolicyRelease.instruments).toHaveLength(38);
    expect(statePolicyRelease.modelEffects).toHaveLength(0);
    expect(statePolicyRelease.instruments.every((row) => row.reviewStatus === "candidate" && row.legalStatus === "unknown")).toBe(true);
    statePolicyRelease.coverage.forEach((row) => {
      expect(row.coverageStatus).toBe("discovery-pending");
      expect(row.reviewedInstrumentIds).toHaveLength(0);
      expect(row.note).toMatch(/primary|not a primary/i);
    });
  });

  it("publishes the data-run blockers instead of presenting partial refreshes as complete", () => {
    expect(dataRunRelease.metadata.overallStatus).toBe("partial");
    expect(dataRunRelease.metadata.stateContextRecords).toBe(50);
    expect(dataRunRelease.metadata.statePolicyCoverageRecords).toBe(50);
    expect(dataRunRelease.metadata.candidatePolicyInstruments).toBe(38);
    expect(dataRunRelease.checks.some((row) => row.status === "blocked" || row.status === "credential-required")).toBe(true);
  });
});
