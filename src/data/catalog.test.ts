import { describe, expect, it } from "vitest";
import { facilities, scenarios, sources } from "./catalog";
import { aggregateStates, filterByScope, summarizeFacilities } from "../domain/model";
import epochTimelineRelease from "../../public/data/releases/2026-07-21/epoch-timelines.json";
import { epochHardwareRelease } from "./hardware";
import { countyCrosswalkRelease, getCountyCrosswalk } from "./counties";
import { getWatershedCrosswalk, watershedCrosswalkRelease } from "./watersheds";
import { getPrincipalAquiferCrosswalk, principalAquiferCrosswalkRelease } from "./aquifers";
import { balancingAuthorityCrosswalkRelease, getBalancingAuthorityCrosswalk } from "./balancingAuthorities";
import { getUtilityTerritoryCrosswalk, utilityTerritoryCrosswalkRelease } from "./utilityTerritories";

describe("release catalogue integrity", () => {
  it("uses unique stable facility and source identifiers", () => {
    expect(new Set(facilities.map((facility) => facility.id)).size).toBe(facilities.length);
    expect(new Set(sources.map((source) => source.id)).size).toBe(sources.length);
  });

  it("provides complete quantitative provenance envelopes", () => {
    const sourceIds = new Set(sources.map((source) => source.id));
    facilities.forEach((facility) => {
      [facility.facilityMw, facility.h100Equivalents].forEach((measurement) => {
        expect(measurement.value).toBeGreaterThan(0);
        expect(measurement.unit.length).toBeGreaterThan(2);
        expect(measurement.definition.length).toBeGreaterThan(20);
        expect(measurement.method.length).toBeGreaterThan(20);
        expect(measurement.uncertaintyPct).toBeGreaterThan(0);
        expect(measurement.datasetVersion.length).toBeGreaterThan(5);
        expect(sourceIds.has(measurement.sourceId)).toBe(true);
      });
      expect(facility.completionProbability).toBeGreaterThanOrEqual(0);
      expect(facility.completionProbability).toBeLessThanOrEqual(1);
    });
  });

  it("links every facility to HTTPS evidence and a transparent calculation sheet", () => {
    facilities.forEach((facility) => {
      expect(facility.sourceLinks.length).toBeGreaterThan(0);
      facility.sourceLinks.forEach((source) => expect(source.url.startsWith("https://")).toBe(true));
      expect(facility.calculationSheet.startsWith("https://")).toBe(true);
    });
  });

  it("reconciles state probability-adjusted capacity to the national total", () => {
    const qualified = filterByScope(facilities, "qualified-ai");
    const national = summarizeFacilities(qualified).probabilityAdjustedMw;
    const states = [...aggregateStates(qualified).values()].reduce(
      (sum, state) => sum + state.probabilityAdjustedMw,
      0,
    );
    expect(states).toBeCloseTo(national, 8);
  });

  it("defines all constraint multipliers for every scenario without probabilities", () => {
    const expectedConstraints = [
      "grid", "water", "semiconductors", "permitting", "construction", "financing", "demand",
    ];
    scenarios.forEach((scenario) => {
      expect(Object.keys(scenario.constraintMultipliers).sort()).toEqual([...expectedConstraints].sort());
      expect(scenario.annualGrowth).toBeGreaterThanOrEqual(0);
      expect(scenario.uncertainty).toBeGreaterThan(0);
      expect("probability" in scenario).toBe(false);
    });
  });

  it("links curated facilities to the checksum-pinned upstream timeline package", () => {
    expect(epochTimelineRelease.metadata.facilityCount).toBe(65);
    expect(epochTimelineRelease.metadata.timelineCount).toBe(368);
    expect(epochTimelineRelease.metadata.hardwareDeploymentCount).toBeGreaterThan(100);
    expect(epochHardwareRelease.metadata.hardwareDeploymentCount).toBe(epochTimelineRelease.metadata.hardwareDeploymentCount);
    expect(epochTimelineRelease.metadata.upstreamTimelineSha256).toMatch(/^[a-f0-9]{64}$/);
    facilities.forEach((facility) => {
      const key = (facility.upstreamName ?? facility.name) as keyof typeof epochTimelineRelease.facilities;
      const upstream = epochTimelineRelease.facilities[key];
      expect(upstream, facility.name).not.toBeNull();
      expect(upstream!.timeline.length).toBeGreaterThan(0);
      expect(upstream!.timeline.every((point) => point.provenance === "Estimated")).toBe(true);
    });
  });

  it("crosswalks every curated facility to a county without storing sensitive coordinates", () => {
    expect(countyCrosswalkRelease.metadata.facilityCount).toBe(facilities.length);
    expect(countyCrosswalkRelease.metadata.matchedCount).toBe(facilities.length);
    expect(countyCrosswalkRelease.metadata.sensitiveCoordinatesStored).toBe(false);
    facilities.forEach((facility) => {
      const row = getCountyCrosswalk(facility.id)!;
      expect(row.countyFips).toMatch(/^\d{5}$/);
      expect(row.countyFips.startsWith(row.stateFips)).toBe(true);
      expect(["Estimated", "Imputed"]).toContain(row.provenance);
      expect("latitude" in row || "longitude" in row || "coordinates" in row).toBe(false);
    });
  });

  it("crosswalks every curated facility to HUC-8 without making HUC-12 or coordinate claims", () => {
    expect(watershedCrosswalkRelease.metadata.matchedCount).toBe(facilities.length);
    expect(watershedCrosswalkRelease.metadata.sensitiveCoordinatesStored).toBe(false);
    facilities.forEach((facility) => {
      const row = getWatershedCrosswalk(facility.id)!;
      expect(row.huc8).toMatch(/^\d{8}$/);
      expect(row.wbdLoadDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(["Estimated", "Imputed"]).toContain(row.provenance);
      expect("latitude" in row || "longitude" in row || "coordinates" in row || "huc12" in row).toBe(false);
    });
  });

  it("adds regional principal-aquifer context without storing coordinates or claiming water supply", () => {
    expect(principalAquiferCrosswalkRelease.metadata.facilityCount).toBe(facilities.length);
    expect(principalAquiferCrosswalkRelease.metadata.mappedCount).toBe(facilities.length);
    expect(principalAquiferCrosswalkRelease.metadata.sensitiveCoordinatesStored).toBe(false);
    expect(principalAquiferCrosswalkRelease.metadata.sourceScale).toBe("1:2,500,000");
    facilities.forEach((facility) => {
      const row = getPrincipalAquiferCrosswalk(facility.id)!;
      expect(row.principalAquifers.length).toBeGreaterThan(0);
      expect(row.disclosure).toMatch(/not evidence|does not mean/i);
      expect(["Estimated", "Imputed"]).toContain(row.provenance);
      expect("latitude" in row || "longitude" in row || "coordinates" in row).toBe(false);
    });
  });

  it("keeps legacy balancing-authority candidates provisional and out of forecast inputs", () => {
    expect(balancingAuthorityCrosswalkRelease.metadata.facilityCount).toBe(facilities.length);
    expect(balancingAuthorityCrosswalkRelease.metadata.sensitiveCoordinatesStored).toBe(false);
    expect(balancingAuthorityCrosswalkRelease.metadata.singleMatchCount + balancingAuthorityCrosswalkRelease.metadata.ambiguousMatchCount + balancingAuthorityCrosswalkRelease.metadata.unresolvedCount).toBe(facilities.length);
    facilities.forEach((facility) => {
      const row = getBalancingAuthorityCrosswalk(facility.id)!;
      expect(row.eligibleForForecastInputs).toBe(false);
      expect(row.confidence).toBe("low");
      expect(row.disclosure).toMatch(/confirm|unknown/i);
      expect("latitude" in row || "longitude" in row || "coordinates" in row).toBe(false);
    });
  });

  it("retains overlapping retail-utility candidates without promoting them to service facts", () => {
    expect(utilityTerritoryCrosswalkRelease.metadata.facilityCount).toBe(facilities.length);
    expect(utilityTerritoryCrosswalkRelease.metadata.ambiguousMatchCount).toBeGreaterThan(0);
    expect(utilityTerritoryCrosswalkRelease.metadata.sensitiveCoordinatesStored).toBe(false);
    facilities.forEach((facility) => {
      const row = getUtilityTerritoryCrosswalk(facility.id)!;
      expect(row.eligibleForForecastInputs).toBe(false);
      expect(row.confidence).toBe("low");
      expect(row.disclosure).toMatch(/confirm|unknown/i);
      expect("latitude" in row || "longitude" in row || "coordinates" in row).toBe(false);
    });
  });
});
