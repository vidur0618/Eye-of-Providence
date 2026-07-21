import { useEffect, useState } from "react";

export interface EpochTimelinePoint {
  date: string;
  constructionStatus: string;
  buildingsOperational: number | null;
  itPowerMw: number | null;
  facilityPowerMw: number | null;
  h100Equivalents: number | null;
  performance8BitOps: number | null;
  waterUseMgd: number | null;
  provenance: "Estimated";
}

export interface EpochFacilityTimeline {
  country: string;
  address: string;
  owner: string;
  users: string;
  selectedSourcesMarkdown: string;
  calculationSheet: string;
  timeline: EpochTimelinePoint[];
  hardwareDeployments: Array<{
    date: string;
    chipType: string;
    units: number | null;
    chipTypeSource: string;
    unitsSource: string;
    owner: string;
    user: string;
    notes: string;
    provenance: "Estimated";
  }>;
}

export interface EpochTimelineRelease {
  metadata: {
    generatedFrom: string;
    accessedAt: string;
    upstreamSha256: string;
    upstreamTimelineSha256: string;
    provenance: "Estimated";
    facilityCount: number;
    timelineCount: number;
    hardwareDeploymentCount: number;
    note: string;
  };
  facilities: Record<string, EpochFacilityTimeline>;
}

let timelineReleasePromise: Promise<EpochTimelineRelease> | null = null;

export const loadEpochTimelineRelease = () => {
  if (!timelineReleasePromise) {
    timelineReleasePromise = fetch(`${import.meta.env.BASE_URL}data/releases/2026-07-21/epoch-timelines.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Timeline release failed to load: ${response.status}`);
        return response.json() as Promise<EpochTimelineRelease>;
      });
  }
  return timelineReleasePromise;
};

export const useEpochTimeline = (facilityName: string) => {
  const [result, setResult] = useState<{
    facilityName: string;
    timeline: EpochFacilityTimeline | null;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    loadEpochTimelineRelease()
      .then((release) => {
        if (active) setResult({ facilityName, timeline: release.facilities[facilityName] ?? null, failed: false });
      })
      .catch(() => {
        if (active) setResult({ facilityName, timeline: null, failed: true });
      });
    return () => { active = false; };
  }, [facilityName]);
  return result?.facilityName === facilityName
    ? { timeline: result.timeline, failed: result.failed }
    : { timeline: null, failed: false };
};
