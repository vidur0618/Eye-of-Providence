import rawBalancingAuthorityCrosswalk from "./generated/balancing-authority-crosswalk.json";

export interface BalancingAuthorityCandidate {
  authorityId: string | null;
  authorityName: string | null;
  featureSource: string | null;
  featureSourceDate: string | null;
  validationMethod: string | null;
  validationDate: string | null;
  website: string | null;
  featureYear: string | null;
}

export interface BalancingAuthorityCrosswalkRow {
  facilityId: string;
  upstreamName: string;
  candidates: BalancingAuthorityCandidate[];
  matchCount: number;
  assignmentStatus: "unconfirmed-geometric" | "ambiguous-geometric" | "unresolved";
  locatorMethod: "address-range-transient-coordinate" | "city-centroid-fallback";
  provenance: "Estimated" | "Imputed";
  confidence: "low";
  eligibleForForecastInputs: false;
  sourceAddressSha256: string;
  addressLookupError: string | null;
  disclosure: string;
}

export interface BalancingAuthorityCrosswalkRelease {
  metadata: {
    source: string;
    sourceItemUrl: string;
    sourceItemId: string;
    serviceUrl: string;
    sourceSnapshotDate: string;
    accessedAt: string;
    facilityCount: number;
    singleMatchCount: number;
    ambiguousMatchCount: number;
    unresolvedCount: number;
    addressRangeMatchCount: number;
    cityCentroidFallbackCount: number;
    sensitiveCoordinatesStored: false;
    license: string;
    credits: string;
    useConstraints: string;
  };
  facilities: Record<string, BalancingAuthorityCrosswalkRow>;
}

export const balancingAuthorityCrosswalkRelease = rawBalancingAuthorityCrosswalk as BalancingAuthorityCrosswalkRelease;
export const getBalancingAuthorityCrosswalk = (facilityId: string) => balancingAuthorityCrosswalkRelease.facilities[facilityId] ?? null;

export const summarizeBalancingAuthorities = (facilityIds: string[]) => {
  const counts = new Map<string, { authorityName: string; authorityId: string; count: number; imputedLocators: number; unresolved: boolean }>();
  facilityIds.forEach((facilityId) => {
    const row = getBalancingAuthorityCrosswalk(facilityId);
    if (!row) return;
    const candidates = row.candidates.length > 0
      ? row.candidates
      : [{ authorityName: "Unresolved balancing authority", authorityId: "—" }];
    candidates.forEach((candidate) => {
      const authorityName = candidate.authorityName ?? "Unnamed control area";
      const authorityId = candidate.authorityId ?? "—";
      const key = `${authorityId}:${authorityName}`;
      const current = counts.get(key) ?? { authorityName, authorityId, count: 0, imputedLocators: 0, unresolved: row.candidates.length === 0 };
      current.count += 1;
      if (row.provenance === "Imputed") current.imputedLocators += 1;
      counts.set(key, current);
    });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.authorityName.localeCompare(b.authorityName));
};
