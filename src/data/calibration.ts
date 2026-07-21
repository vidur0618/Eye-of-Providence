import rawCalibrationReadiness from "./generated/calibration-readiness.json";

export interface CalibrationCriterion {
  id: string;
  label: string;
  required: number;
  observed: number;
  passed: boolean;
}

export const calibrationReadiness = rawCalibrationReadiness as {
  metadata: {
    asOf: string;
    modelVersion: string;
    generatedBy: string;
    status: "ready-for-evaluation" | "blocked-insufficient-historical-evidence";
    calibrationClaimAllowed: false;
  };
  evidence: {
    frozenEpochSnapshotDates: string[];
    independentOutcomeFiles: string[];
    currentSnapshotTimelineRowsExcludedAsHindcasts: true;
    exclusionReason: string;
  };
  criteria: CalibrationCriterion[];
  implementedMetrics: string[];
  releaseDecision: string;
};
