import contextReleaseJson from "./generated/state-context.json";
import policyReleaseJson from "./generated/state-policies.json";
import dataRunJson from "./generated/data-run.json";
import type {
  PolicyInstrument,
  PolicyModelEffect,
  StatePolicyCoverage,
  StateResourceContext,
} from "../domain/types";

export interface StateContextRelease {
  metadata: {
    schemaVersion: string;
    releaseDate: string;
    recordCount: number;
    eiaYear: string;
    usgsWaterUseYear: string;
    droughtValidDate: string;
    analyticalStatus: string;
  };
  states: StateResourceContext[];
}

export interface StatePolicyRelease {
  metadata: {
    schemaVersion: string;
    releaseDate: string;
    stateCount: number;
    instrumentCount: number;
    modelEffectCount: number;
    discoverySource: string;
    discoveryIndexes: string[];
    publicIndexUpdated?: string;
    analyticalStatus: string;
  };
  coverage: StatePolicyCoverage[];
  instruments: PolicyInstrument[];
  modelEffects: PolicyModelEffect[];
}

export interface DataRunRelease {
  metadata: {
    schemaVersion: string;
    runDate: string;
    generatedAt: string;
    overallStatus: "passed" | "partial";
    stateContextRecords: number;
    statePolicyCoverageRecords: number;
    reviewedPolicyStates: number;
    candidatePolicyInstruments: number;
    approvedPolicyEffects: number;
  };
  checks: Array<{
    id: string;
    category: string;
    label: string;
    status: string;
    stateCoverage: string;
    sourceDate: string;
    sourceUrl: string;
    note: string;
  }>;
  gaps: string[];
}

export const stateContextRelease = contextReleaseJson as StateContextRelease;
export const statePolicyRelease = policyReleaseJson as StatePolicyRelease;
export const dataRunRelease = dataRunJson as DataRunRelease;
export const stateContextByCode = new Map(stateContextRelease.states.map((row) => [row.state, row]));
export const statePolicyCoverageByCode = new Map(statePolicyRelease.coverage.map((row) => [row.state, row]));
export const statePolicyInstruments = statePolicyRelease.instruments;
export const statePolicyEffects = statePolicyRelease.modelEffects;

export const policiesForState = (state: string) =>
  statePolicyInstruments.filter((instrument) => instrument.state === state);

export const effectsForState = (state: string) =>
  statePolicyEffects.filter((effect) => effect.state === state);
