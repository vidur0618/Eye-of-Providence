import rawUtilityTerritoryCrosswalk from "./generated/utility-territory-crosswalk.json";

export interface UtilityTerritoryCandidate {
  utilityId: string | null;
  utilityName: string | null;
  utilityType: string | null;
  utilityState: string | null;
  regulated: string | null;
  controlArea: string | null;
  planningArea: string | null;
  holdingCompany: string | null;
  featureSource: string | null;
  featureSourceDate: string | null;
  validationMethod: string | null;
  validationDate: string | null;
  website: string | null;
  featureYear: string | null;
}

export interface UtilityTerritoryCrosswalkRow {
  facilityId: string;
  upstreamName: string;
  candidates: UtilityTerritoryCandidate[];
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

export interface UtilityTerritoryCrosswalkRelease {
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
  facilities: Record<string, UtilityTerritoryCrosswalkRow>;
}

export const utilityTerritoryCrosswalkRelease = rawUtilityTerritoryCrosswalk as UtilityTerritoryCrosswalkRelease;
export const getUtilityTerritoryCrosswalk = (facilityId: string) => utilityTerritoryCrosswalkRelease.facilities[facilityId] ?? null;
