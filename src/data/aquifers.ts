import rawAquiferCrosswalk from "./generated/principal-aquifer-crosswalk.json";

export interface PrincipalAquiferCandidate {
  aquiferName: string | null;
  aquiferCode: string | null;
  nationalAquiferCode: string | null;
  rockName: string | null;
  rockTypeCode: string | null;
}

export interface PrincipalAquiferCrosswalkRow {
  facilityId: string;
  upstreamName: string;
  mapped: boolean;
  principalAquifers: PrincipalAquiferCandidate[];
  rawFeatureCount: number;
  distinctFeatureCount: number;
  overlapStatus: "multiple-distinct-polygons" | "single-polygon" | "not-mapped";
  locatorMethod: "address-range-transient-coordinate" | "city-centroid-fallback";
  provenance: "Estimated" | "Imputed";
  confidence: "medium" | "low";
  sourceAddressSha256: string;
  addressLookupError: string | null;
  disclosure: string;
}

export interface PrincipalAquiferCrosswalkRelease {
  metadata: {
    source: string;
    sourceUrl: string;
    serviceUrl: string;
    featureType: string;
    accessedAt: string;
    datasetPublicationDate: string;
    sourceScale: string;
    facilityCount: number;
    mappedCount: number;
    unmappedCount: number;
    multipleDistinctPolygonCount: number;
    addressRangeMatchCount: number;
    cityCentroidFallbackCount: number;
    sensitiveCoordinatesStored: false;
    license: string;
    useConstraints: string;
  };
  facilities: Record<string, PrincipalAquiferCrosswalkRow>;
}

export const principalAquiferCrosswalkRelease = rawAquiferCrosswalk as PrincipalAquiferCrosswalkRelease;
export const getPrincipalAquiferCrosswalk = (facilityId: string) => principalAquiferCrosswalkRelease.facilities[facilityId] ?? null;

export const summarizePrincipalAquifers = (facilityIds: string[]) => {
  const counts = new Map<string, { aquiferName: string; aquiferCode: string; count: number; lowConfidence: number }>();
  facilityIds.forEach((facilityId) => {
    const row = getPrincipalAquiferCrosswalk(facilityId);
    if (!row) return;
    const candidates = row.principalAquifers.length > 0
      ? row.principalAquifers
      : [{ aquiferName: "No principal-aquifer polygon mapped", aquiferCode: "—" }];
    candidates.forEach((candidate) => {
      const aquiferName = candidate.aquiferName ?? "Unnamed principal-aquifer polygon";
      const aquiferCode = candidate.aquiferCode ?? "—";
      const key = `${aquiferCode}:${aquiferName}`;
      const current = counts.get(key) ?? { aquiferName, aquiferCode, count: 0, lowConfidence: 0 };
      current.count += 1;
      if (row.confidence === "low") current.lowConfidence += 1;
      counts.set(key, current);
    });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.aquiferName.localeCompare(b.aquiferName));
};
