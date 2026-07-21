import rawCountyCrosswalk from "./generated/county-crosswalk.json";

export interface CountyCrosswalkRow {
  facilityId: string;
  upstreamName: string;
  countyFips: string;
  countyName: string;
  stateFips: string;
  method: "address-range" | "city-centroid-fallback";
  provenance: "Estimated" | "Imputed";
  confidence: "medium" | "low";
  boundaryVintage: string;
  boundaryVintageId: string;
  benchmark: string;
  benchmarkId: string;
  sourceAddressSha256: string;
  addressLookupError: string | null;
  disclosure: string;
}

export interface CountyCrosswalkRelease {
  metadata: {
    source: string;
    sourceUrl: string;
    accessedAt: string;
    benchmark: string;
    vintage: string;
    facilityCount: number;
    matchedCount: number;
    addressRangeMatchCount: number;
    cityCentroidFallbackCount: number;
    sensitiveCoordinatesStored: false;
    note: string;
  };
  facilities: Record<string, CountyCrosswalkRow>;
}

export const countyCrosswalkRelease = rawCountyCrosswalk as CountyCrosswalkRelease;
export const getCountyCrosswalk = (facilityId: string) => countyCrosswalkRelease.facilities[facilityId] ?? null;

export const summarizeCounties = (facilityIds: string[]) => {
  const counts = new Map<string, { countyName: string; countyFips: string; count: number; lowConfidence: number }>();
  facilityIds.forEach((facilityId) => {
    const row = getCountyCrosswalk(facilityId);
    if (!row) return;
    const current = counts.get(row.countyFips) ?? { countyName: row.countyName, countyFips: row.countyFips, count: 0, lowConfidence: 0 };
    current.count += 1;
    if (row.confidence === "low") current.lowConfidence += 1;
    counts.set(row.countyFips, current);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.countyName.localeCompare(b.countyName));
};
