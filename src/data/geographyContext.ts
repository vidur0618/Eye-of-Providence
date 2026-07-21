import { useEffect, useState } from "react";
import type { CountyCrosswalkRelease } from "./counties";
import type { WatershedCrosswalkRelease } from "./watersheds";
import type { PrincipalAquiferCrosswalkRelease } from "./aquifers";
import type { BalancingAuthorityCrosswalkRelease } from "./balancingAuthorities";
import type { UtilityTerritoryCrosswalkRelease } from "./utilityTerritories";

export interface GeographyContextRelease {
  county: CountyCrosswalkRelease;
  watershed: WatershedCrosswalkRelease;
  aquifer: PrincipalAquiferCrosswalkRelease;
  balancingAuthority: BalancingAuthorityCrosswalkRelease;
  utilityTerritory: UtilityTerritoryCrosswalkRelease;
}

const releaseRoot = `${import.meta.env.BASE_URL}data/releases/2026-07-21`;
let contextPromise: Promise<GeographyContextRelease> | null = null;

const fetchJson = <T,>(fileName: string) => fetch(`${releaseRoot}/${fileName}`).then((response) => {
  if (!response.ok) throw new Error(`${fileName} failed to load: ${response.status}`);
  return response.json() as Promise<T>;
});

export const loadGeographyContextRelease = () => {
  if (!contextPromise) {
    contextPromise = Promise.all([
      fetchJson<CountyCrosswalkRelease>("county-crosswalk.json"),
      fetchJson<WatershedCrosswalkRelease>("huc8-crosswalk.json"),
      fetchJson<PrincipalAquiferCrosswalkRelease>("principal-aquifer-crosswalk.json"),
      fetchJson<BalancingAuthorityCrosswalkRelease>("balancing-authority-crosswalk.json"),
      fetchJson<UtilityTerritoryCrosswalkRelease>("utility-territory-crosswalk.json"),
    ]).then(([county, watershed, aquifer, balancingAuthority, utilityTerritory]) => ({ county, watershed, aquifer, balancingAuthority, utilityTerritory }));
  }
  return contextPromise;
};

export const useGeographyContext = (enabled: boolean) => {
  const [state, setState] = useState<{ context: GeographyContextRelease | null; failed: boolean }>({ context: null, failed: false });
  useEffect(() => {
    if (!enabled || state.context) return;
    let active = true;
    loadGeographyContextRelease()
      .then((context) => { if (active) setState({ context, failed: false }); })
      .catch(() => { if (active) setState({ context: null, failed: true }); });
    return () => { active = false; };
  }, [enabled, state.context]);
  return { ...state, loading: enabled && !state.context && !state.failed };
};

export const summarizeCounties = (release: CountyCrosswalkRelease, facilityIds: string[]) => {
  const counts = new Map<string, { countyName: string; countyFips: string; count: number; lowConfidence: number }>();
  facilityIds.forEach((facilityId) => {
    const row = release.facilities[facilityId];
    if (!row) return;
    const current = counts.get(row.countyFips) ?? { countyName: row.countyName, countyFips: row.countyFips, count: 0, lowConfidence: 0 };
    current.count += 1;
    if (row.confidence === "low") current.lowConfidence += 1;
    counts.set(row.countyFips, current);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.countyName.localeCompare(b.countyName));
};

export const summarizeWatersheds = (release: WatershedCrosswalkRelease, facilityIds: string[]) => {
  const counts = new Map<string, { watershedName: string; huc8: string; count: number; lowConfidence: number }>();
  facilityIds.forEach((facilityId) => {
    const row = release.facilities[facilityId];
    if (!row) return;
    const current = counts.get(row.huc8) ?? { watershedName: row.watershedName, huc8: row.huc8, count: 0, lowConfidence: 0 };
    current.count += 1;
    if (row.confidence === "low") current.lowConfidence += 1;
    counts.set(row.huc8, current);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.watershedName.localeCompare(b.watershedName));
};

export const summarizePrincipalAquifers = (release: PrincipalAquiferCrosswalkRelease, facilityIds: string[]) => {
  const counts = new Map<string, { aquiferName: string; aquiferCode: string; count: number; lowConfidence: number }>();
  facilityIds.forEach((facilityId) => {
    const row = release.facilities[facilityId];
    if (!row) return;
    const candidates = row.principalAquifers.length > 0 ? row.principalAquifers : [{ aquiferName: "No principal-aquifer polygon mapped", aquiferCode: "—" }];
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

export const summarizeBalancingAuthorities = (release: BalancingAuthorityCrosswalkRelease, facilityIds: string[]) => {
  const counts = new Map<string, { authorityName: string; authorityId: string; count: number; imputedLocators: number; unresolved: boolean }>();
  facilityIds.forEach((facilityId) => {
    const row = release.facilities[facilityId];
    if (!row) return;
    const candidates = row.candidates.length > 0 ? row.candidates : [{ authorityName: "Unresolved balancing authority", authorityId: "—" }];
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

export const summarizeUtilityTerritories = (release: UtilityTerritoryCrosswalkRelease, facilityIds: string[]) => {
  const counts = new Map<string, { utilityName: string; utilityId: string; count: number; imputedLocators: number }>();
  facilityIds.forEach((facilityId) => {
    const row = release.facilities[facilityId];
    if (!row) return;
    const candidates = row.candidates.length > 0 ? row.candidates : [{ utilityName: "Unresolved serving utility", utilityId: "—" }];
    candidates.forEach((candidate) => {
      const utilityName = candidate.utilityName ?? "Unnamed utility territory";
      const utilityId = candidate.utilityId ?? "—";
      const key = `${utilityId}:${utilityName}`;
      const current = counts.get(key) ?? { utilityName, utilityId, count: 0, imputedLocators: 0 };
      current.count += 1;
      if (row.provenance === "Imputed") current.imputedLocators += 1;
      counts.set(key, current);
    });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.utilityName.localeCompare(b.utilityName));
};
