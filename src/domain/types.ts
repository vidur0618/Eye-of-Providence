export type ProvenanceClass =
  | "Observed"
  | "Reported"
  | "Verified derived"
  | "Estimated"
  | "Imputed"
  | "Forecast"
  | "Scenario output";

export type ProjectStage =
  | "rumored"
  | "announced"
  | "site-controlled"
  | "permit-submitted"
  | "permit-approved"
  | "interconnection-requested"
  | "utility-commitment"
  | "under-construction"
  | "partially-energized"
  | "operational"
  | "expanded"
  | "delayed"
  | "cancelled"
  | "retired";

export type AiClass =
  | "AI-primary"
  | "AI-significant"
  | "mixed"
  | "general-or-unknown"
  | "government-or-defense";

export type Constraint =
  | "grid"
  | "water"
  | "semiconductors"
  | "permitting"
  | "construction"
  | "financing"
  | "demand";

export interface Measurement {
  value: number;
  unit: string;
  definition: string;
  provenance: ProvenanceClass;
  sourceId: string;
  sourcePublicationDate: string;
  accessDate: string;
  method: string;
  uncertaintyPct: number;
  datasetVersion: string;
}

export interface FacilityRecord {
  id: string;
  name: string;
  upstreamName?: string;
  city: string;
  state: string;
  longitude: number;
  latitude: number;
  locationPrecision: "city-centroid" | "public-site";
  operator: string;
  users: string[];
  project?: string;
  aiClass: AiClass;
  aiConfidence: "high" | "medium" | "low";
  aiEvidence: string;
  stage: ProjectStage;
  stageConfidence: "high" | "medium" | "low";
  stageNote: string;
  completionProbability: number;
  facilityMw: Measurement;
  h100Equivalents: Measurement;
  bindingConstraint: Constraint;
  sourceLinks: Array<{ label: string; url: string; tier: 1 | 2 | 3 }>;
  calculationSheet: string;
  analystReview: "approved" | "needs-review";
}

export interface SourceRecord {
  id: string;
  name: string;
  publisher: string;
  url: string;
  measures: string;
  coverage: string;
  cadence: string;
  access: string;
  license: string;
  provenance: ProvenanceClass;
  aiSpecific: boolean;
  gaps: string;
  automated: boolean;
  accessedAt: string;
}

export interface Scenario {
  id: string;
  name: string;
  shortName: string;
  description: string;
  annualGrowth: number;
  pue: number;
  loadFactor: number;
  wueLitersPerKwh: number;
  uncertainty: number;
  constraintMultipliers: Record<Constraint, number>;
  changedParameters: string[];
  startYear: number;
  rampYears: number;
  sourceRationale: string;
}

export interface ForecastPoint {
  year: number;
  centralMw: number;
  lowMw: number;
  highMw: number;
  provenance: "Forecast" | "Scenario output";
}

export interface ForecastPeriod extends ForecastPoint {
  period: string;
  timeIndex: number;
  grain: "quarter" | "year";
}

export interface StateMetrics {
  state: string;
  facilityCount: number;
  cataloguedMw: number;
  operationalMw: number;
  probabilityAdjustedMw: number;
  h100Equivalents: number;
  dominantConstraint: Constraint | "none";
}

export type FreshnessStatus = "current" | "aging" | "stale" | "unavailable";

export type ComparisonMode = "baseline" | "without-policy" | "two-state";

export type MapLayerKey =
  | "forecast-mw"
  | "forecast-electricity"
  | "forecast-water"
  | "forecast-delta"
  | "electricity-sales"
  | "electricity-price"
  | "electricity-mix"
  | "electricity-share"
  | "water-withdrawals"
  | "water-cooling"
  | "water-share"
  | "water-drought"
  | "policy-active"
  | "policy-pending"
  | "policy-effects"
  | "coverage-freshness";

export interface DashboardSelection {
  scenarioId: string;
  periodIndex: number;
  mapLayer: MapLayerKey;
  comparisonMode: ComparisonMode;
  selectedState: string | null;
  comparisonState: string | null;
}

export interface StateResourceContext {
  state: string;
  stateName: string;
  electricity: {
    retailSalesTwh: number | null;
    averageCommercialPriceCentsPerKwh: number | null;
    generationMixPct: {
      fossil: number | null;
      renewable: number | null;
      nuclear: number | null;
      other: number | null;
    };
    sourceDate: string;
    freshness: FreshnessStatus;
  };
  water: {
    freshwaterWithdrawalsMgd: number | null;
    sourceDate: string;
    freshness: FreshnessStatus;
    limitation: string;
  };
  drought: {
    d1D4Pct: number | null;
    d2D4Pct: number | null;
    d3D4Pct: number | null;
    d4Pct: number | null;
    sourceDate: string;
    freshness: FreshnessStatus;
    limitation: string;
  };
  sources: Array<{
    id: string;
    label: string;
    url: string;
    accessedAt: string;
    provenance: "Reported";
  }>;
}

export interface FacilityForecastPeriod {
  facilityId: string;
  state: string;
  period: string;
  timeIndex: number;
  knownProjectMw: number;
  cataloguedMw: number;
  lowMw: number;
  highMw: number;
  provenance: "Forecast" | "Scenario output";
}

export interface StateForecastPeriod extends ForecastPeriod {
  state: string;
  knownProjectMw: number;
  unannouncedMw: number;
  annualTwh: number;
  directWaterMgd: number;
  coverage: "tracked-records" | "no-tracked-records";
  activePolicyMechanisms: string[];
}

export type PolicyReviewStatus = "candidate" | "reviewed";

export interface PolicyInstrument {
  id: string;
  mechanismId: string;
  state: string;
  title: string;
  documentType: string;
  legalStatus: "enacted" | "effective" | "pending" | "proposed" | "expired" | "unknown";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  primarySourceUrl: string | null;
  discoverySourceUrl: string | null;
  topics: string[];
  reviewStatus: PolicyReviewStatus;
  reviewedAt: string | null;
  summary: string;
}

export interface PolicyModelEffect {
  id: string;
  policyInstrumentId: string;
  mechanismId: string;
  state: string;
  constraint: Constraint;
  effectiveFrom: string;
  effectiveTo: string | null;
  factorLow: number;
  factorCentral: number;
  factorHigh: number;
  method: string;
  primarySourceUrl: string;
  approvalStatus: "approved" | "proposed" | "rejected";
  githubApprovalRef: string | null;
  approvedAt: string | null;
}

export interface StatePolicyCoverage {
  state: string;
  coverageStatus: "reviewed" | "discovery-pending" | "no-reviewed-records";
  reviewedInstrumentIds: string[];
  candidateInstrumentIds: string[];
  lastReviewed: string | null;
  freshness: FreshnessStatus;
  note: string;
}
