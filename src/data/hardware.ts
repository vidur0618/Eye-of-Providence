import rawHardwareData from "./generated/epoch-hardware.json";

export interface EpochHardwareDeployment {
  date: string;
  chipType: string;
  units: number | null;
  chipTypeSource: string;
  unitsSource: string;
  owner: string;
  user: string;
  notes: string;
  provenance: "Estimated";
}

interface EpochHardwareRelease {
  metadata: {
    generatedFrom: string;
    accessedAt: string;
    upstreamSha256: string;
    hardwareDeploymentCount: number;
    provenance: "Estimated";
  };
  facilities: Record<string, EpochHardwareDeployment[]>;
}

export const epochHardwareRelease = rawHardwareData as EpochHardwareRelease;
export const getEpochHardware = (facilityName: string) => epochHardwareRelease.facilities[facilityName] ?? [];
