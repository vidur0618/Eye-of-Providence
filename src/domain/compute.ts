import { AS_OF_DATE } from "../data/catalog";
import { getEpochHardware } from "../data/hardware";
import type { FacilityRecord } from "./types";

export interface HardwareStockSummary {
  totalAccelerators: number;
  byGeneration: Array<{ chipType: string; units: number }>;
  facilitiesWithUnitEvidence: number;
  facilityCount: number;
  latestEvidenceDate: string | null;
  provenance: "Estimated";
  method: string;
}

export const summarizeHardwareStock = (
  records: FacilityRecord[],
  asOf = AS_OF_DATE,
): HardwareStockSummary => {
  const totals = new Map<string, number>();
  let facilitiesWithUnitEvidence = 0;
  let latestEvidenceDate: string | null = null;

  records.forEach((facility) => {
    const hardware = getEpochHardware(facility.upstreamName ?? facility.name);
    const eligible = hardware.filter(
      (deployment) => deployment.date <= asOf && deployment.units != null,
    );
    const latestByStockKey = new Map<string, (typeof eligible)[number]>();
    eligible.forEach((deployment) => {
      const key = `${deployment.chipType}|${deployment.owner}|${deployment.user}`;
      const prior = latestByStockKey.get(key);
      if (!prior || deployment.date > prior.date) latestByStockKey.set(key, deployment);
    });
    if (latestByStockKey.size > 0) facilitiesWithUnitEvidence += 1;
    latestByStockKey.forEach((deployment) => {
      totals.set(deployment.chipType, (totals.get(deployment.chipType) ?? 0) + (deployment.units ?? 0));
      if (latestEvidenceDate == null || deployment.date > latestEvidenceDate) latestEvidenceDate = deployment.date;
    });
  });

  const byGeneration = [...totals.entries()]
    .map(([chipType, units]) => ({ chipType, units }))
    .sort((a, b) => b.units - a.units);

  return {
    totalAccelerators: byGeneration.reduce((sum, row) => sum + row.units, 0),
    byGeneration,
    facilitiesWithUnitEvidence,
    facilityCount: records.length,
    latestEvidenceDate,
    provenance: "Estimated",
    method: "For each facility and chip/owner/user stock key, use the latest dated Epoch unit estimate on or before the release as-of date; sum across keys. Future deployments are excluded.",
  };
};
