import rawWatershedCrosswalk from "./generated/huc8-crosswalk.json";

export interface WatershedCrosswalkRow {
  facilityId: string;
  upstreamName: string;
  huc8: string;
  watershedName: string;
  states: string;
  wbdLoadDate: string;
  locatorMethod: "address-range-transient-coordinate" | "city-centroid-fallback";
  provenance: "Estimated" | "Imputed";
  confidence: "medium" | "low";
  sourceAddressSha256: string;
  addressLookupError: string | null;
  disclosure: string;
}

export interface WatershedCrosswalkRelease {
  metadata: {
    source: string;
    sourceUrl: string;
    accessedAt: string;
    hydrologicUnit: string;
    facilityCount: number;
    matchedCount: number;
    addressRangeMatchCount: number;
    cityCentroidFallbackCount: number;
    sensitiveCoordinatesStored: false;
    useConstraints: string;
  };
  facilities: Record<string, WatershedCrosswalkRow>;
}

export const watershedCrosswalkRelease = rawWatershedCrosswalk as WatershedCrosswalkRelease;
export const getWatershedCrosswalk = (facilityId: string) => watershedCrosswalkRelease.facilities[facilityId] ?? null;

export const summarizeWatersheds = (facilityIds: string[]) => {
  const counts = new Map<string, { watershedName: string; huc8: string; count: number; lowConfidence: number }>();
  facilityIds.forEach((facilityId) => {
    const row = getWatershedCrosswalk(facilityId);
    if (!row) return;
    const current = counts.get(row.huc8) ?? { watershedName: row.watershedName, huc8: row.huc8, count: 0, lowConfidence: 0 };
    current.count += 1;
    if (row.confidence === "low") current.lowConfidence += 1;
    counts.set(row.huc8, current);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.watershedName.localeCompare(b.watershedName));
};
