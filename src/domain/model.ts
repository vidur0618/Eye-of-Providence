import { AS_OF_DATE, MODEL_VERSION } from "../data/catalog";
import type {
  Constraint,
  FacilityRecord,
  ForecastPoint,
  ForecastPeriod,
  FacilityForecastPeriod,
  PolicyInstrument,
  PolicyModelEffect,
  ProvenanceClass,
  Scenario,
  StateForecastPeriod,
  StateMetrics,
} from "./types";

export type Scope = "qualified-ai" | "all-catalogued";

export const isQualifiedAi = (facility: FacilityRecord) =>
  facility.aiClass === "AI-primary" ||
  (facility.aiClass === "AI-significant" && facility.aiConfidence !== "low");

export const filterByScope = (records: FacilityRecord[], scope: Scope) =>
  scope === "all-catalogued" ? records : records.filter(isQualifiedAi);

export const operationalShare = (facility: FacilityRecord) => {
  switch (facility.stage) {
    case "operational":
    case "expanded":
      return 1;
    case "partially-energized":
      return 0.55;
    default:
      return 0;
  }
};

const dominantConstraint = (records: FacilityRecord[]): Constraint | "none" => {
  if (records.length === 0) return "none";
  const totals = new Map<Constraint, number>();
  records.forEach((facility) => {
    totals.set(
      facility.bindingConstraint,
      (totals.get(facility.bindingConstraint) ?? 0) + facility.facilityMw.value,
    );
  });
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

export const summarizeFacilities = (records: FacilityRecord[]): StateMetrics => ({
  state: records[0]?.state ?? "US",
  facilityCount: records.length,
  cataloguedMw: records.reduce((sum, facility) => sum + facility.facilityMw.value, 0),
  operationalMw: records.reduce(
    (sum, facility) => sum + facility.facilityMw.value * operationalShare(facility),
    0,
  ),
  probabilityAdjustedMw: records.reduce(
    (sum, facility) => sum + facility.facilityMw.value * facility.completionProbability,
    0,
  ),
  h100Equivalents: records.reduce((sum, facility) => sum + facility.h100Equivalents.value, 0),
  dominantConstraint: dominantConstraint(records),
});

export const aggregateStates = (records: FacilityRecord[]) => {
  const grouped = new Map<string, FacilityRecord[]>();
  records.forEach((facility) => {
    grouped.set(facility.state, [...(grouped.get(facility.state) ?? []), facility]);
  });
  return new Map([...grouped].map(([state, rows]) => [state, { ...summarizeFacilities(rows), state }]));
};

const constraintFactor = (scenario: Scenario, records: FacilityRecord[]) => {
  const active = new Set(records.map((facility) => facility.bindingConstraint));
  if (active.size === 0) return 1;
  return Math.min(...[...active].map((constraint) => scenario.constraintMultipliers[constraint]));
};

const knownProjectMw = (facility: FacilityRecord, elapsed: number) => {
  const operationalMw = facility.facilityMw.value * operationalShare(facility);
  const probabilityAdjustedMw = Math.max(
    operationalMw,
    facility.facilityMw.value * facility.completionProbability,
  );
  if (elapsed <= 0) return probabilityAdjustedMw;
  return operationalMw +
    (probabilityAdjustedMw - operationalMw) * (1 - Math.exp(-elapsed / 2.4));
};

const periodDate = (period: string) => {
  const quarter = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarter) return `${quarter[1]}-${String((Number(quarter[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  return `${period}-01-01`;
};

const elapsedForPeriod = (period: ForecastPeriod) => {
  const baseYear = Number(AS_OF_DATE.slice(0, 4));
  if (period.grain === "year") return period.year - baseYear;
  const quarter = Number(period.period.slice(-1));
  return period.year - baseYear + (quarter - 3) / 4;
};

export const isPolicyEffectActive = (
  effect: PolicyModelEffect,
  instrument: PolicyInstrument | undefined,
  period: string,
) => {
  if (!instrument || instrument.id !== effect.policyInstrumentId) return false;
  if (instrument.mechanismId !== effect.mechanismId || instrument.state !== effect.state) return false;
  if (instrument.reviewStatus !== "reviewed" || !instrument.primarySourceUrl) return false;
  if (instrument.legalStatus !== "enacted" && instrument.legalStatus !== "effective") return false;
  if (effect.approvalStatus !== "approved" || !effect.githubApprovalRef || !effect.approvedAt) return false;
  if (!effect.primarySourceUrl || !effect.method) return false;
  if (![effect.factorLow, effect.factorCentral, effect.factorHigh].every((value) => Number.isFinite(value) && value > 0)) return false;
  const date = periodDate(period);
  return effect.effectiveFrom <= date && (!effect.effectiveTo || effect.effectiveTo >= date);
};

export const composePolicyFactors = (
  state: string,
  period: string,
  instruments: PolicyInstrument[],
  effects: PolicyModelEffect[],
) => {
  const instrumentById = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  const mechanisms = new Set<string>();
  const active = effects.filter((effect) => {
    if (effect.state !== state || mechanisms.has(effect.mechanismId)) return false;
    const eligible = isPolicyEffectActive(effect, instrumentById.get(effect.policyInstrumentId), period);
    if (eligible) mechanisms.add(effect.mechanismId);
    return eligible;
  });
  return {
    low: active.reduce((factor, effect) => factor * effect.factorLow, 1),
    central: active.reduce((factor, effect) => factor * effect.factorCentral, 1),
    high: active.reduce((factor, effect) => factor * effect.factorHigh, 1),
    mechanismIds: active.map((effect) => effect.mechanismId),
  };
};

const calculateForecastPoint = (
  summary: StateMetrics,
  scenario: Scenario,
  factor: number,
  elapsed: number,
  horizonYears: number,
): Omit<ForecastPoint, "year"> => {
  if (elapsed === 0) {
    return {
      centralMw: summary.probabilityAdjustedMw,
      lowMw: summary.operationalMw,
      highMw: summary.cataloguedMw,
      provenance: scenario.id === "baseline" ? "Forecast" : "Scenario output",
    };
  }

  const baseYear = Number(AS_OF_DATE.slice(0, 4));
  const decimalYear = baseYear + elapsed;
  const ramp = Math.min(1, Math.max(0, (decimalYear - scenario.startYear + 1) / scenario.rampYears));
  const annualRate = scenario.annualGrowth * factor * (0.55 + 0.45 * ramp);
  const knownProjectRamp =
    summary.operationalMw +
    (summary.probabilityAdjustedMw - summary.operationalMw) * (1 - Math.exp(-elapsed / 2.4));
  const unannouncedBuild =
    summary.probabilityAdjustedMw * (Math.pow(1 + annualRate, elapsed) - 1);
  const centralMw = knownProjectRamp + unannouncedBuild;
  const interval = scenario.uncertainty * Math.sqrt(elapsed / horizonYears);

  return {
    centralMw,
    lowMw: Math.max(summary.operationalMw, centralMw * (1 - interval)),
    highMw: centralMw * (1 + interval),
    provenance: scenario.id === "baseline" ? "Forecast" : "Scenario output",
  };
};

export const forecastCapacity = (
  records: FacilityRecord[],
  scenario: Scenario,
  throughYear = 2040,
): ForecastPoint[] => {
  const summary = summarizeFacilities(records);
  const baseYear = Number(AS_OF_DATE.slice(0, 4));
  const factor = constraintFactor(scenario, records);

  return Array.from({ length: throughYear - baseYear + 1 }, (_, index) => {
    const year = baseYear + index;
    const elapsed = year - baseYear;
    return {
      year,
      ...calculateForecastPoint(summary, scenario, factor, elapsed, throughYear - baseYear),
    };
  });
};

export const forecastTimeline = (
  records: FacilityRecord[],
  scenario: Scenario,
): ForecastPeriod[] => {
  const summary = summarizeFacilities(records);
  const factor = constraintFactor(scenario, records);
  const baseYear = Number(AS_OF_DATE.slice(0, 4));
  const quarterly: ForecastPeriod[] = [];

  for (let year = baseYear; year <= 2030; year += 1) {
    const startQuarter = year === baseYear ? 3 : 1;
    for (let quarter = startQuarter; quarter <= 4; quarter += 1) {
      const elapsed = year - baseYear + (quarter - 3) / 4;
      quarterly.push({
        year,
        period: `${year}-Q${quarter}`,
        timeIndex: year + (quarter - 1) / 4,
        grain: "quarter",
        ...calculateForecastPoint(summary, scenario, factor, elapsed, 14),
      });
    }
  }

  const annual = Array.from({ length: 10 }, (_, index): ForecastPeriod => {
    const year = 2031 + index;
    return {
      year,
      period: String(year),
      timeIndex: year,
      grain: "year",
      ...calculateForecastPoint(summary, scenario, factor, year - baseYear, 14),
    };
  });

  return [...quarterly, ...annual];
};

export const forecastFacilityTimeline = (
  records: FacilityRecord[],
  scenario: Scenario,
): FacilityForecastPeriod[] => {
  const periods = forecastTimeline([], scenario);
  return records.flatMap((facility) => periods.map((period) => {
    const elapsed = Math.max(0, elapsedForPeriod(period));
    const central = knownProjectMw(facility, elapsed);
    const interval = Math.min(0.75, (facility.facilityMw.uncertaintyPct / 100) + scenario.uncertainty * Math.sqrt(elapsed / 14));
    return {
      facilityId: facility.id,
      state: facility.state,
      period: period.period,
      timeIndex: period.timeIndex,
      knownProjectMw: central,
      cataloguedMw: facility.facilityMw.value,
      lowMw: Math.max(facility.facilityMw.value * operationalShare(facility), central * (1 - interval)),
      highMw: Math.min(facility.facilityMw.value, central * (1 + interval)),
      provenance: scenario.id === "baseline" ? "Forecast" : "Scenario output",
    };
  }));
};

export const forecastStateTimeline = (
  records: FacilityRecord[],
  state: string,
  scenario: Scenario,
  instruments: PolicyInstrument[] = [],
  effects: PolicyModelEffect[] = [],
  withPolicy = true,
): StateForecastPeriod[] => {
  const stateRecords = records.filter((facility) => facility.state === state);
  const summary = summarizeFacilities(stateRecords);
  const baseFactor = constraintFactor(scenario, stateRecords);
  return forecastTimeline([], scenario).map((period) => {
    const elapsed = Math.max(0, elapsedForPeriod(period));
    const policy = withPolicy ? composePolicyFactors(state, period.period, instruments, effects) : { low: 1, central: 1, high: 1, mechanismIds: [] };
    const centralPoint = calculateForecastPoint(summary, scenario, baseFactor * policy.central, elapsed, 14);
    const lowPoint = calculateForecastPoint(summary, scenario, baseFactor * Math.min(policy.low, policy.high), elapsed, 14);
    const highPoint = calculateForecastPoint(summary, scenario, baseFactor * Math.max(policy.low, policy.high), elapsed, 14);
    const knownMw = stateRecords.reduce((sum, facility) => sum + knownProjectMw(facility, elapsed), 0);
    const resources = deriveResources(centralPoint.centralMw, scenario, scenario.id === "baseline" ? "Forecast" : "Scenario output");
    return {
      ...period,
      ...centralPoint,
      state,
      knownProjectMw: knownMw,
      unannouncedMw: Math.max(0, centralPoint.centralMw - knownMw),
      lowMw: Math.min(centralPoint.lowMw, lowPoint.lowMw),
      highMw: Math.max(centralPoint.highMw, highPoint.highMw),
      annualTwh: resources.annualTwh,
      directWaterMgd: resources.directWaterMgd,
      coverage: stateRecords.length > 0 ? "tracked-records" : "no-tracked-records",
      activePolicyMechanisms: policy.mechanismIds,
    };
  });
};

export const reconcileForecast = (
  records: FacilityRecord[],
  scenario: Scenario,
  periodIndex: number,
) => {
  const facilityRows = forecastFacilityTimeline(records, scenario).filter((row) => row.period === forecastTimeline([], scenario)[periodIndex]?.period);
  const knownFacilityMw = facilityRows.reduce((sum, row) => sum + row.knownProjectMw, 0);
  const states = [...new Set(records.map((facility) => facility.state))];
  const stateRows = states.map((state) => forecastStateTimeline(records, state, scenario)[periodIndex]);
  return {
    knownFacilityMw,
    knownStateMw: stateRows.reduce((sum, row) => sum + row.knownProjectMw, 0),
    nationalMw: stateRows.reduce((sum, row) => sum + row.centralMw, 0),
    stateRows,
  };
};

export const capacityAtYear = (
  records: FacilityRecord[],
  scenario: Scenario,
  year: number,
) => forecastCapacity(records, scenario).find((point) => point.year === year)!;

export const deriveResources = (
  facilityMw: number,
  scenario: Scenario,
  inputProvenance: Extract<ProvenanceClass, "Verified derived" | "Forecast" | "Scenario output"> = "Verified derived",
) => {
  const itMw = facilityMw / scenario.pue;
  const annualTwh = (facilityMw * scenario.loadFactor * 8_760) / 1_000_000;
  const directWaterMgd =
    (itMw * 1_000 * 24 * scenario.wueLitersPerKwh) / 3_785_411.784;
  const supplyPowerFactorAssumption = 0.95;
  const apparentSupplyMva = facilityMw / supplyPowerFactorAssumption;

  return {
    facilityMw,
    itMw,
    annualTwh,
    directWaterMgd,
    apparentSupplyMva,
    supplyPowerFactorAssumption,
    pue: scenario.pue,
    loadFactor: scenario.loadFactor,
    wueLitersPerKwh: scenario.wueLitersPerKwh,
    provenance: inputProvenance,
    modelVersion: MODEL_VERSION,
    equations: {
      itMw: "IT MW = facility MW ÷ PUE",
      annualTwh: "Annual TWh = facility MW × load factor × 8,760 ÷ 1,000,000",
      directWaterMgd: "Direct MGD = IT MW × 1,000 kW/MW × 24 h/day × WUE L/kWh ÷ 3,785,411.784 L/MG",
      apparentSupplyMva: "Apparent supply MVA = facility MW ÷ assumed 0.95 power factor",
    },
  };
};

export const probabilityAdjustedEquation =
  "Probability-adjusted MW = Σ(phase facility MW × stage-completion probability). It is a forecast expectation, not connected load.";
