import { describe, expect, it } from "vitest";
import { facilities, scenarios } from "../data/catalog";
import {
  deriveResources,
  filterByScope,
  forecastFacilityTimeline,
  forecastCapacity,
  forecastStateTimeline,
  forecastTimeline,
  composePolicyFactors,
  isPolicyEffectActive,
  operationalShare,
  reconcileForecast,
  summarizeFacilities,
} from "./model";
import type { PolicyInstrument, PolicyModelEffect } from "./types";

describe("provenance-aware capacity model", () => {
  it("keeps raw catalogue and probability-adjusted capacity separate", () => {
    const summary = summarizeFacilities(facilities);
    expect(summary.cataloguedMw).toBeGreaterThan(summary.probabilityAdjustedMw);
    expect(summary.probabilityAdjustedMw).toBeGreaterThan(summary.operationalMw);
  });

  it("does not count construction-stage capacity as operational", () => {
    const construction = facilities.find((facility) => facility.stage === "under-construction")!;
    expect(operationalShare(construction)).toBe(0);
  });

  it("excludes low-confidence general and speculative facilities from qualified AI scope", () => {
    const qualified = filterByScope(facilities, "qualified-ai");
    expect(qualified.length).toBeLessThan(facilities.length);
    expect(qualified.every((facility) => facility.aiClass !== "general-or-unknown")).toBe(true);
  });

  it("produces widening, ordered forecast intervals", () => {
    const baseline = scenarios[0];
    const forecast = forecastCapacity(filterByScope(facilities, "qualified-ai"), baseline);
    forecast.forEach((point) => {
      expect(point.lowMw).toBeLessThanOrEqual(point.centralMw);
      expect(point.highMw).toBeGreaterThanOrEqual(point.centralMw);
    });
    const last = forecast.at(-1)!;
    expect(last.highMw - last.lowMw).toBeGreaterThan(forecast[1].highMw - forecast[1].lowMw);
  });

  it("keeps facility power, IT power, energy, and water in distinct units", () => {
    const resources = deriveResources(1_000, scenarios[0]);
    expect(resources.itMw).toBeCloseTo(847.46, 1);
    expect(resources.annualTwh).toBeCloseTo(7.5336, 3);
    expect(resources.directWaterMgd).toBeGreaterThan(0);
    expect(resources.apparentSupplyMva).toBeCloseTo(1_000 / 0.95, 4);
    expect(resources.supplyPowerFactorAssumption).toBe(0.95);
    expect(resources.facilityMw).toBe(1_000);
  });

  it("retains future provenance through deterministic resource conversions", () => {
    expect(deriveResources(1_000, scenarios[0], "Forecast").provenance).toBe("Forecast");
    expect(deriveResources(1_000, scenarios[1], "Scenario output").provenance).toBe("Scenario output");
  });

  it("emits quarterly periods through 2030 and annual periods through 2040", () => {
    const timeline = forecastTimeline(filterByScope(facilities, "qualified-ai"), scenarios[0]);
    const quarters = timeline.filter((point) => point.grain === "quarter");
    const years = timeline.filter((point) => point.grain === "year");
    expect(quarters[0].period).toBe("2026-Q3");
    expect(quarters.at(-1)?.period).toBe("2030-Q4");
    expect(years[0].period).toBe("2031");
    expect(years.at(-1)?.period).toBe("2040");
    expect(timeline.every((point, index) => index === 0 || point.timeIndex > timeline[index - 1].timeIndex)).toBe(true);
  });

  it("reconciles facility known-project ramps exactly to state known-project totals", () => {
    const qualified = filterByScope(facilities, "qualified-ai");
    scenarios.forEach((scenario) => {
      [0, 9, 17, 27].forEach((periodIndex) => {
        const reconciliation = reconcileForecast(qualified, scenario, periodIndex);
        expect(reconciliation.knownFacilityMw).toBeCloseTo(reconciliation.knownStateMw, 8);
      });
    });
    expect(forecastFacilityTimeline(qualified, scenarios[0]).every((row) => row.knownProjectMw <= row.cataloguedMw)).toBe(true);
  });

  it("keeps no tracked coverage distinct from numeric zero", () => {
    const alaska = forecastStateTimeline(facilities, "AK", scenarios[0]);
    expect(alaska.every((row) => row.coverage === "no-tracked-records")).toBe(true);
    expect(alaska.every((row) => row.centralMw === 0)).toBe(true);
  });

  it("activates only reviewed, enacted, dated, primary-source, GitHub-approved policy effects", () => {
    const instrument: PolicyInstrument = {
      id: "tx-law", mechanismId: "tx-grid-mechanism", state: "TX", title: "Synthetic eligibility fixture", documentType: "statute",
      legalStatus: "enacted", effectiveFrom: "2028-01-01", effectiveTo: "2032-12-31", primarySourceUrl: "https://example.gov/law",
      discoverySourceUrl: null, topics: ["grid"], reviewStatus: "reviewed", reviewedAt: "2026-07-21", summary: "Test-only fixture.",
    };
    const effect: PolicyModelEffect = {
      id: "tx-effect", policyInstrumentId: instrument.id, mechanismId: instrument.mechanismId, state: "TX", constraint: "grid",
      effectiveFrom: "2028-01-01", effectiveTo: "2032-12-31", factorLow: .8, factorCentral: .9, factorHigh: 1,
      method: "Test-only quantitative method.", primarySourceUrl: instrument.primarySourceUrl!, approvalStatus: "approved",
      githubApprovalRef: "https://github.com/example/repo/pull/1", approvedAt: "2026-07-21",
    };
    expect(isPolicyEffectActive(effect, instrument, "2027-Q4")).toBe(false);
    expect(isPolicyEffectActive(effect, instrument, "2028-Q1")).toBe(true);
    expect(isPolicyEffectActive(effect, instrument, "2033")).toBe(false);
    expect(isPolicyEffectActive({ ...effect, approvalStatus: "proposed" }, instrument, "2028-Q1")).toBe(false);
    expect(isPolicyEffectActive(effect, { ...instrument, reviewStatus: "candidate" }, "2028-Q1")).toBe(false);
  });

  it("deduplicates policy mechanisms and propagates approved factor uncertainty", () => {
    const instrument: PolicyInstrument = {
      id: "tx-law", mechanismId: "shared-mechanism", state: "TX", title: "Synthetic eligibility fixture", documentType: "statute", legalStatus: "effective",
      effectiveFrom: "2026-01-01", effectiveTo: null, primarySourceUrl: "https://example.gov/law", discoverySourceUrl: null, topics: ["grid"],
      reviewStatus: "reviewed", reviewedAt: "2026-07-21", summary: "Test-only fixture.",
    };
    const effect: PolicyModelEffect = {
      id: "effect-a", policyInstrumentId: instrument.id, mechanismId: instrument.mechanismId, state: "TX", constraint: "grid", effectiveFrom: "2026-01-01",
      effectiveTo: null, factorLow: .5, factorCentral: 1, factorHigh: 1.5, method: "Test-only quantitative method.", primarySourceUrl: instrument.primarySourceUrl!,
      approvalStatus: "approved", githubApprovalRef: "https://github.com/example/repo/pull/1", approvedAt: "2026-07-21",
    };
    const composed = composePolicyFactors("TX", "2030-Q4", [instrument], [effect, { ...effect, id: "effect-b" }]);
    expect(composed.mechanismIds).toEqual(["shared-mechanism"]);
    expect(composed.central).toBe(1);
    const tx = facilities.filter((facility) => facility.state === "TX");
    const without = forecastStateTimeline(tx, "TX", scenarios[0], [instrument], [effect], false)[17];
    const withPolicy = forecastStateTimeline(tx, "TX", scenarios[0], [instrument], [effect], true)[17];
    expect(withPolicy.centralMw).toBeCloseTo(without.centralMw, 8);
    expect(withPolicy.highMw - withPolicy.lowMw).toBeGreaterThan(without.highMw - without.lowMw);
  });
});
