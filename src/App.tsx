import { useEffect, useMemo, useState } from "react";
import { AnimatedNumber } from "./components/AnimatedNumber";
import { ForecastSmallMultiples } from "./components/ForecastSmallMultiples";
import { ProvenanceBadge } from "./components/ProvenanceBadge";
import { SourceLineageDrawer } from "./components/SourceLineageDrawer";
import { StateForecastTable, type StateTableRow } from "./components/StateForecastTable";
import { UsMap } from "./components/UsMap";
import {
  AS_OF_DATE,
  DATASET_VERSION,
  MODEL_VERSION,
  facilities,
  policyItems,
  scenarios,
  sources,
} from "./data/catalog";
import {
  deriveResources,
  filterByScope,
  forecastCapacity,
  forecastFacilityTimeline,
  forecastStateTimeline,
  forecastTimeline,
  probabilityAdjustedEquation,
  type Scope,
} from "./domain/model";
import type { DashboardSelection, FacilityRecord, MapLayerKey, ProvenanceClass, Scenario, StateForecastPeriod } from "./domain/types";
import { STATE_NAMES } from "./data/states";
import { geographyLayers } from "./data/geographies";
import { useEpochTimeline } from "./data/timelines";
import { calibrationReadiness } from "./data/calibration";
import { downloadReviewReceipts, useReviewReceipts } from "./data/reviewReceipts";
import {
  useGeographyContext,
  type GeographyContextRelease,
} from "./data/geographyContext";
import {
  dataRunRelease,
  policiesForState,
  stateContextByCode,
  stateContextRelease,
  statePolicyCoverageByCode,
  statePolicyEffects,
  statePolicyInstruments,
  statePolicyRelease,
} from "./data/stateResearch";

type View = "overview" | "facilities" | "scenarios" | "policy" | "sources" | "methodology";

const number = (value: number, digits = 0) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const percent = (value: number) => `${Math.round(value * 100)}%`;

const exportFacilityCsv = (records: FacilityRecord[]) => {
  const headers = [
    "stable_id", "name", "city", "state", "operator", "ai_class", "ai_confidence",
    "project_stage", "stage_confidence", "facility_mw", "power_provenance",
    "power_uncertainty_pct", "completion_probability", "h100_equivalents",
    "compute_provenance", "binding_constraint", "dataset_version", "as_of_date",
  ];
  const rows = records.map((facility) => [
    facility.id, facility.name, facility.city, facility.state, facility.operator,
    facility.aiClass, facility.aiConfidence, facility.stage, facility.stageConfidence,
    facility.facilityMw.value, facility.facilityMw.provenance,
    facility.facilityMw.uncertaintyPct, facility.completionProbability,
    facility.h100Equivalents.value, facility.h100Equivalents.provenance,
    facility.bindingConstraint, facility.facilityMw.datasetVersion, AS_OF_DATE,
  ]);
  const encode = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(encode).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${DATASET_VERSION}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const mapLayerMeta: Record<MapLayerKey, { group: string; label: string; short: string; description: string }> = {
  "forecast-mw": { group: "Forecast", label: "Facility capacity", short: "MW", description: "State total includes fixed-location known-project bubbles plus separate state-level unannounced growth." },
  "forecast-electricity": { group: "Forecast", label: "Annual electricity", short: "TWh/yr", description: "Modeled annual energy; not observed consumption." },
  "forecast-water": { group: "Forecast", label: "Direct cooling water", short: "MGD", description: "Modeled direct cooling demand; not a withdrawal, entitlement, or provider relationship." },
  "forecast-delta": { group: "Forecast", label: "Delta from baseline", short: "Δ MW", description: "Selected scenario minus baseline for the same period." },
  "electricity-sales": { group: "Electricity context", label: "Reported retail sales", short: "TWh", description: "EIA 2024 reported state retail sales; not grid headroom." },
  "electricity-price": { group: "Electricity context", label: "Commercial price", short: "¢/kWh", description: "EIA 2024 average commercial price." },
  "electricity-mix": { group: "Electricity context", label: "Renewable + nuclear generation", short: "% gen.", description: "Reported 2024 generation share; not a marginal power-supply claim." },
  "electricity-share": { group: "Electricity context", label: "Modeled demand share of sales", short: "% sales", description: "Scenario electricity divided by reported 2024 retail sales; a denominator comparison, not observed data-center use." },
  "water-withdrawals": { group: "Water context", label: "Freshwater withdrawals", short: "MGD", description: "USGS 2015 historical statewide freshwater withdrawals." },
  "water-cooling": { group: "Water context", label: "Modeled cooling demand", short: "MGD", description: "Scenario direct cooling demand, not reported withdrawal." },
  "water-share": { group: "Water context", label: "Cooling share of 2015 withdrawals", short: "% hist.", description: "Modeled direct cooling demand divided by the stale 2015 historical denominator." },
  "water-drought": { group: "Water context", label: "D1–D4 drought area", short: "% area", description: "Weekly U.S. Drought Monitor state area; not facility water availability." },
  "policy-active": { group: "Policy", label: "Reviewed active instruments", short: "count", description: "Count of reviewed state instruments active in the selected period." },
  "policy-pending": { group: "Policy", label: "Pending candidates", short: "count", description: "Discovery candidates; they cannot change forecasts." },
  "policy-effects": { group: "Policy", label: "Approved model effects", short: "count", description: "GitHub-reviewed quantitative effects active in the selected period." },
  "coverage-freshness": { group: "Evidence", label: "Released evidence datasets", short: "datasets", description: "Count of electricity, water, drought, and reviewed policy datasets with released evidence." },
};

const stateCodes = Object.keys(STATE_NAMES);
const viewLabels: Record<View, string> = { overview: "Dashboard", facilities: "Facilities", scenarios: "Scenarios", policy: "Policy", sources: "Sources", methodology: "Methods" };
const initialSelection = (): DashboardSelection => {
  const fallback: DashboardSelection = { scenarioId: "baseline", periodIndex: 17, mapLayer: "forecast-mw", comparisonMode: "baseline", selectedState: "TX", comparisonState: "OH" };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const state = params.get("state");
  const compare = params.get("compare");
  const scenario = params.get("scenario");
  const layer = params.get("layer") as MapLayerKey | null;
  const mode = params.get("mode") as DashboardSelection["comparisonMode"] | null;
  const periodParam = params.get("period");
  const period = periodParam == null ? Number.NaN : Number(periodParam);
  return {
    scenarioId: scenarios.some((item) => item.id === scenario) ? scenario! : fallback.scenarioId,
    periodIndex: Number.isInteger(period) && period >= 0 && period < 28 ? period : fallback.periodIndex,
    mapLayer: layer && layer in mapLayerMeta ? layer : fallback.mapLayer,
    comparisonMode: mode && ["baseline", "without-policy", "two-state"].includes(mode) ? mode : fallback.comparisonMode,
    selectedState: state && STATE_NAMES[state] ? state : fallback.selectedState,
    comparisonState: compare && STATE_NAMES[compare] ? compare : fallback.comparisonState,
  };
};

const aggregateForecastSeries = (series: StateForecastPeriod[][]): StateForecastPeriod[] => {
  const template = series[0] ?? [];
  return template.map((period, index) => {
    const rows = series.map((state) => state[index]);
    return {
      ...period,
      state: "US",
      centralMw: rows.reduce((sum, row) => sum + row.centralMw, 0),
      lowMw: rows.reduce((sum, row) => sum + row.lowMw, 0),
      highMw: rows.reduce((sum, row) => sum + row.highMw, 0),
      knownProjectMw: rows.reduce((sum, row) => sum + row.knownProjectMw, 0),
      unannouncedMw: rows.reduce((sum, row) => sum + row.unannouncedMw, 0),
      annualTwh: rows.reduce((sum, row) => sum + row.annualTwh, 0),
      directWaterMgd: rows.reduce((sum, row) => sum + row.directWaterMgd, 0),
      coverage: rows.some((row) => row.coverage === "tracked-records") ? "tracked-records" : "no-tracked-records",
      activePolicyMechanisms: [...new Set(rows.flatMap((row) => row.activePolicyMechanisms))],
    };
  });
};

const exportStateCsv = (rows: StateTableRow[], period: string, scenario: string) => {
  const headers = ["state", "state_name", "coverage", "period_mw", "delta_from_baseline_mw", "electricity_twh_year", "direct_water_mgd", "modeled_share_of_2024_retail_sales_pct", "d1_d4_area_pct", "reviewed_policy_count", "freshness"];
  const encode = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const output = [headers, ...rows.map((row) => [row.state, row.stateName, row.coverage, row.mw, row.deltaMw, row.electricityTwh, row.waterMgd, row.electricitySharePct, row.droughtPct, row.reviewedPolicyCount, row.freshness])].map((row) => row.map(encode).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([output], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = `kop-state-view-${scenario}-${period}.csv`; link.click(); URL.revokeObjectURL(url);
};

function DefinitionTerm({ term, children }: { term: string; children: React.ReactNode }) {
  return <div className="definition-row"><dt>{term}</dt><dd>{children}</dd></div>;
}

function App() {
  const [view, setView] = useState<View>("overview");
  const [selection, setSelection] = useState<DashboardSelection>(initialSelection);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scope, setScope] = useState<Scope>("qualified-ai");
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [facilitySearch, setFacilitySearch] = useState("");
  const [citationCopied, setCitationCopied] = useState(false);

  const { scenarioId, periodIndex: selectedPeriodIndex, mapLayer, comparisonMode, selectedState, comparisonState } = selection;
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const baseline = scenarios[0];
  const timeline = forecastTimeline([], scenario);
  const selectedPeriod = timeline[Math.min(selectedPeriodIndex, timeline.length - 1)];
  const manualSelection = (patch: Partial<DashboardSelection>) => { setIsPlaying(false); setSelection((current) => ({ ...current, ...patch })); };
  const setScenarioId = (id: string) => manualSelection({ scenarioId: id });
  const setSelectedPeriodIndex = (index: number) => manualSelection({ periodIndex: Math.max(0, Math.min(index, timeline.length - 1)) });
  const setSelectedState = (state: string | null) => manualSelection({ selectedState: state });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (selectedState) params.set("state", selectedState);
    params.set("scenario", scenarioId); params.set("period", String(selectedPeriodIndex)); params.set("layer", mapLayer); params.set("mode", comparisonMode);
    if (comparisonState) params.set("compare", comparisonState);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}#cockpit`);
  }, [comparisonMode, comparisonState, mapLayer, scenarioId, selectedPeriodIndex, selectedState]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setSelection((current) => {
      if (current.periodIndex >= timeline.length - 1) { window.clearInterval(timer); setIsPlaying(false); return current; }
      return { ...current, periodIndex: current.periodIndex + 1 };
    }), 900);
    return () => window.clearInterval(timer);
  }, [isPlaying, timeline.length]);

  const scopedFacilities = useMemo(() => filterByScope(facilities, scope), [scope]);
  const geographyFacilities = useMemo(
    () => selectedState ? scopedFacilities.filter((facility) => facility.state === selectedState) : scopedFacilities,
    [scopedFacilities, selectedState],
  );
  const stateForecasts = useMemo(() => new Map(stateCodes.map((state) => [state, forecastStateTimeline(scopedFacilities, state, scenario, statePolicyInstruments, statePolicyEffects, true)])), [scenario, scopedFacilities]);
  const baselineStateForecasts = useMemo(() => new Map(stateCodes.map((state) => [state, forecastStateTimeline(scopedFacilities, state, baseline, statePolicyInstruments, statePolicyEffects, true)])), [baseline, scopedFacilities]);
  const withoutPolicyForecasts = useMemo(() => new Map(stateCodes.map((state) => [state, forecastStateTimeline(scopedFacilities, state, scenario, statePolicyInstruments, statePolicyEffects, false)])), [scenario, scopedFacilities]);
  const nationalTimeline = aggregateForecastSeries([...stateForecasts.values()]);
  const nationalBaselineTimeline = aggregateForecastSeries([...baselineStateForecasts.values()]);
  const nationalWithoutPolicyTimeline = aggregateForecastSeries([...withoutPolicyForecasts.values()]);
  const geographyTimeline = selectedState ? stateForecasts.get(selectedState)! : nationalTimeline;
  const geographyBaselineTimeline = selectedState ? baselineStateForecasts.get(selectedState)! : nationalBaselineTimeline;
  const geographyWithoutPolicyTimeline = selectedState ? withoutPolicyForecasts.get(selectedState)! : nationalWithoutPolicyTimeline;
  const selectedPoint = geographyTimeline[selectedPeriodIndex];
  const selectedBaselinePoint = geographyBaselineTimeline[selectedPeriodIndex];
  const comparisonTimeline = comparisonMode === "two-state" && comparisonState ? stateForecasts.get(comparisonState)! : comparisonMode === "without-policy" ? geographyWithoutPolicyTimeline : geographyBaselineTimeline;
  const comparisonReferenceLabel = comparisonMode === "two-state" ? (comparisonState ?? "Comparison state") : comparisonMode === "without-policy" ? "Without policy" : "Baseline";
  const geographyContextState = useGeographyContext(Boolean(selectedState || selectedFacilityId));
  const selectedFacility = facilities.find((facility) => facility.id === selectedFacilityId) ?? null;

  const stateValues = new Map<string, number | null>();
  const stateRows: StateTableRow[] = stateCodes.map((state) => {
    const forecast = stateForecasts.get(state)![selectedPeriodIndex];
    const baselinePoint = baselineStateForecasts.get(state)![selectedPeriodIndex];
    const context = stateContextByCode.get(state);
    const policies = policiesForState(state);
    const policyCoverage = statePolicyCoverageByCode.get(state);
    const tracked = forecast.coverage === "tracked-records";
    const electricityShare = tracked && context?.electricity.retailSalesTwh ? forecast.annualTwh / context.electricity.retailSalesTwh * 100 : null;
    const waterShare = tracked && context?.water.freshwaterWithdrawalsMgd ? forecast.directWaterMgd / context.water.freshwaterWithdrawalsMgd * 100 : null;
    const activePolicies = policies.filter((instrument) => instrument.reviewStatus === "reviewed" && ["enacted", "effective"].includes(instrument.legalStatus)).length;
    const pendingPolicies = (policyCoverage?.candidateInstrumentIds.length ?? 0) + policies.filter((instrument) => ["pending", "proposed"].includes(instrument.legalStatus)).length;
    const evidenceCount = context ? [context.electricity.retailSalesTwh, context.water.freshwaterWithdrawalsMgd, context.drought.d1D4Pct].filter((value) => value != null).length + (policies.length > 0 ? 1 : 0) : 0;
    const layerValue: Record<MapLayerKey, number | null> = {
      "forecast-mw": tracked ? forecast.centralMw : null,
      "forecast-electricity": tracked ? forecast.annualTwh : null,
      "forecast-water": tracked ? forecast.directWaterMgd : null,
      "forecast-delta": tracked ? forecast.centralMw - baselinePoint.centralMw : null,
      "electricity-sales": context?.electricity.retailSalesTwh ?? null,
      "electricity-price": context?.electricity.averageCommercialPriceCentsPerKwh ?? null,
      "electricity-mix": context ? (context.electricity.generationMixPct.renewable ?? 0) + (context.electricity.generationMixPct.nuclear ?? 0) : null,
      "electricity-share": electricityShare,
      "water-withdrawals": context?.water.freshwaterWithdrawalsMgd ?? null,
      "water-cooling": tracked ? forecast.directWaterMgd : null,
      "water-share": waterShare,
      "water-drought": context?.drought.d1D4Pct ?? null,
      "policy-active": activePolicies,
      "policy-pending": pendingPolicies,
      "policy-effects": forecast.activePolicyMechanisms.length,
      "coverage-freshness": evidenceCount,
    };
    stateValues.set(state, layerValue[mapLayer]);
    return { state, stateName: STATE_NAMES[state], coverage: forecast.coverage, mw: tracked ? forecast.centralMw : null, deltaMw: tracked ? forecast.centralMw - baselinePoint.centralMw : null, electricityTwh: tracked ? forecast.annualTwh : null, waterMgd: tracked ? forecast.directWaterMgd : null, electricitySharePct: electricityShare, droughtPct: context?.drought.d1D4Pct ?? null, reviewedPolicyCount: activePolicies, freshness: context?.water.freshness ?? "unavailable" };
  });

  const facilityForecastRows = forecastFacilityTimeline(scopedFacilities, scenario).filter((row) => row.period === selectedPeriod.period);
  const facilityForecastMw = new Map(facilityForecastRows.map((row) => [row.facilityId, row.knownProjectMw]));

  const geographyLabel = selectedState ? STATE_NAMES[selectedState] ?? selectedState : "United States";
  const outputProvenance: ProvenanceClass = scenario.id === "baseline" ? "Forecast" : "Scenario output";
  const reviewCount = facilities.filter((facility) => facility.analystReview === "needs-review").length;
  const selectedContext = selectedState ? stateContextByCode.get(selectedState) ?? null : null;
  const selectedPolicyCoverage = selectedState ? statePolicyCoverageByCode.get(selectedState) : null;
  const selectedPolicies = selectedState ? policiesForState(selectedState) : [];
  const selectedReviewedPolicies = selectedPolicies.filter((instrument) => instrument.reviewStatus === "reviewed");
  const selectedCandidatePolicies = selectedPolicies.filter((instrument) => instrument.reviewStatus === "candidate");

  const handleFacilitySelect = (facility: FacilityRecord) => {
    setSelectedFacilityId(facility.id);
    setSelectedState(facility.state);
  };

  const filteredFacilityRows = facilities.filter((facility) => {
    const haystack = `${facility.name} ${facility.city} ${facility.state} ${facility.operator} ${facility.aiClass}`.toLowerCase();
    return haystack.includes(facilitySearch.trim().toLowerCase()) &&
      (scope === "all-catalogued" || scopedFacilities.some((item) => item.id === facility.id));
  });

  const copyCitation = async () => {
    await navigator.clipboard.writeText(
      `Key of Providence. Synchronized State Forecast Cockpit, release 0.2.0, dataset ${DATASET_VERSION}, model ${MODEL_VERSION}, state context schema ${stateContextRelease.metadata.schemaVersion}, as of ${AS_OF_DATE}. Facility estimates adapted from Epoch AI, “AI Data Centers,” CC BY; state context from EIA, USGS, and the U.S. Drought Monitor.`,
    );
    setCitationCopied(true);
    window.setTimeout(() => setCitationCopied(false), 2200);
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">K/P</span>
          <div>
            <p className="eyebrow">AI infrastructure observatory</p>
            <a className="brand-name" href="#top" onClick={() => setView("overview")}>Key of Providence</a>
          </div>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {(["overview", "facilities", "scenarios", "policy", "sources", "methodology"] as View[]).map((item) => (
            <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
              {viewLabels[item]}
            </button>
          ))}
        </nav>
        <div className="release-chip">
          <span className="release-dot" />
          <div><small>As of</small><strong>{AS_OF_DATE}</strong></div>
        </div>
      </header>

      <main id="main-content">
        {view === "overview" && <>
        <section className="hero cockpit-hero" id="top">
          <div className="hero-copy">
            <p className="eyebrow">Synchronized state forecast cockpit · Release 0.2</p>
            <h1>AI infrastructure, <em>state by state</em></h1>
            <p className="hero-deck">One period and scenario drives the map, forecast paths, resource context, policy evidence, and all-state ranking.</p>
          </div>
          <div className="hero-aside compact-truth">
            <div className="truth-note"><span className="truth-icon" aria-hidden="true">◎</span><div><strong>Reported context ≠ forecast input.</strong><p>EIA, USGS, and drought conditions provide denominators and context. They are not grid headroom, water entitlement, or observed data-center consumption.</p></div></div>
            <div className="release-meta"><span><small>Data run</small>{dataRunRelease.metadata.overallStatus}</span><span><small>Coverage</small>50 states</span><span><small>Policy review</small>{statePolicyRelease.metadata.instrumentCount} candidates · {statePolicyEffects.length} effects</span></div>
          </div>
        </section>

        <section className="control-ribbon cockpit-controls" aria-label="Synchronized forecast controls">
          <label><span>Scenario</span><select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label>
          <div className="playback-control" aria-label="Forecast playback">
            <span>Period <strong>{selectedPeriod.period}</strong></span>
            <div><button onClick={() => setSelectedPeriodIndex(selectedPeriodIndex - 1)} disabled={selectedPeriodIndex === 0} aria-label="Previous period">‹</button><button className={isPlaying ? "active" : ""} onClick={() => setIsPlaying((value) => !value)} aria-label={isPlaying ? "Pause forecast" : "Play forecast"}>{isPlaying ? "Ⅱ" : "▶"}</button><button onClick={() => setSelectedPeriodIndex(selectedPeriodIndex + 1)} disabled={selectedPeriodIndex === timeline.length - 1} aria-label="Next period">›</button></div>
          </div>
          <label className="year-control"><span>2026-Q3 → 2040</span><input type="range" min="0" max={timeline.length - 1} step="1" value={selectedPeriodIndex} onChange={(event) => setSelectedPeriodIndex(Number(event.target.value))} aria-label={`Forecast period: ${selectedPeriod.period}`} /><span className="range-ends"><i>2026-Q3</i><i>2030-Q4</i><i>2040</i></span></label>
          <label><span>Map layer</span><select value={mapLayer} onChange={(event) => manualSelection({ mapLayer: event.target.value as MapLayerKey })}>{["Forecast", "Electricity context", "Water context", "Policy", "Evidence"].map((group) => <optgroup key={group} label={group}>{Object.entries(mapLayerMeta).filter(([, meta]) => meta.group === group).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</optgroup>)}</select></label>
          <label><span>Comparison</span><select value={comparisonMode} onChange={(event) => manualSelection({ comparisonMode: event.target.value as DashboardSelection["comparisonMode"] })}><option value="baseline">Selected vs baseline</option><option value="without-policy">With vs without policy</option><option value="two-state">Two-state view</option></select></label>
          <fieldset className="segmented-control"><legend>Facility scope</legend><button className={scope === "qualified-ai" ? "active" : ""} onClick={() => { setIsPlaying(false); setScope("qualified-ai"); }}>Qualified AI</button><button className={scope === "all-catalogued" ? "active" : ""} onClick={() => { setIsPlaying(false); setScope("all-catalogued"); }}>All records</button></fieldset>
        </section>
        </>}

        {view === "overview" && (
          <>
            <section className="cockpit-section section-pad" id="cockpit">
              <div className="section-heading">
                <div><p className="eyebrow">{mapLayerMeta[mapLayer].group} · {selectedPeriod.period} · synchronized view</p><h2>{mapLayerMeta[mapLayer].label}</h2><p className="section-note">{mapLayerMeta[mapLayer].description}</p></div>
                <div className="cockpit-actions">
                  {comparisonMode === "two-state" && <label><span>Compare with</span><select value={comparisonState ?? "TX"} onChange={(event) => manualSelection({ comparisonState: event.target.value })}>{stateCodes.filter((state) => state !== selectedState).map((state) => <option key={state} value={state}>{state} · {STATE_NAMES[state]}</option>)}</select></label>}
                  <button onClick={() => exportStateCsv(stateRows, selectedPeriod.period, scenarioId)}>Export view CSV ↓</button>
                  <button onClick={copyCitation}>{citationCopied ? "Citation copied ✓" : "Copy citation"}</button>
                  <button className="text-button" onClick={() => { setSelectedState(null); setSelectedFacilityId(null); }} disabled={!selectedState}>National view ↗</button>
                </div>
              </div>
              <div className="cockpit-kpis" aria-live="polite">
                <article><span>Forecast capacity <ProvenanceBadge kind={outputProvenance} /></span><strong>{selectedPoint.coverage === "tracked-records" ? <><AnimatedNumber value={selectedPoint.centralMw} /> <small>MW</small></> : "No tracked records"}</strong><small>{number(selectedPoint.knownProjectMw)} known + {number(selectedPoint.unannouncedMw)} state-only MW</small></article>
                <article><span>Delta from baseline <ProvenanceBadge kind="Scenario output" /></span><strong><AnimatedNumber value={selectedPoint.centralMw - selectedBaselinePoint.centralMw} prefix={selectedPoint.centralMw - selectedBaselinePoint.centralMw >= 0 ? "+" : ""} /> <small>MW</small></strong><small>Same state and period</small></article>
                <article><span>Annual electricity <ProvenanceBadge kind={outputProvenance} /></span><strong><AnimatedNumber value={selectedPoint.annualTwh} digits={1} /> <small>TWh/year</small></strong><small>{selectedContext?.electricity.retailSalesTwh ? `${number(selectedPoint.annualTwh / selectedContext.electricity.retailSalesTwh * 100, 2)}% of 2024 reported sales` : "National or unavailable denominator"}</small></article>
                <article><span>Direct cooling demand <ProvenanceBadge kind={outputProvenance} /></span><strong><AnimatedNumber value={selectedPoint.directWaterMgd} digits={1} /> <small>MGD</small></strong><small>{selectedContext?.water.freshwaterWithdrawalsMgd ? `${number(selectedPoint.directWaterMgd / selectedContext.water.freshwaterWithdrawalsMgd * 100, 2)}% of 2015 historical withdrawals` : "National or unavailable denominator"}</small></article>
              </div>
              <div className="cockpit-grid">
                <div className="cockpit-map-column">
                  <UsMap facilities={scopedFacilities} values={stateValues} facilityForecastMw={facilityForecastMw} selectedState={selectedState} selectedFacilityId={selectedFacilityId} onSelectState={(state) => { setSelectedState(state); setSelectedFacilityId(null); }} onSelectFacility={handleFacilitySelect} metricLabel={mapLayerMeta[mapLayer].short} metricDescription={mapLayerMeta[mapLayer].description} />
                  <div className="map-encoding-note"><span><i className="bubble-fill" /> Filled bubble: forecast known-project MW</span><span><i className="bubble-ring" /> Ring: catalogued MW ceiling</span><span>Unannounced growth is state fill only</span></div>
                </div>
                <div className="cockpit-analytics">
                  <ForecastSmallMultiples baseline={comparisonTimeline} comparison={geographyTimeline} selectedPeriodIndex={selectedPeriodIndex} comparisonLabel={`${geographyLabel} · ${scenario.shortName}`} referenceLabel={comparisonReferenceLabel} />
                </div>
                <aside className="state-panel research-panel">
                  <div className="state-panel-head">
                    <p className="eyebrow">{selectedState ? "Selected-state evidence" : "National forecast"}</p>
                    <h3>{geographyLabel}</h3>
                    <p>{geographyFacilities.length} tracked facility records · {selectedPeriod.period}</p>
                  </div>
                  {selectedState ? <>
                    {selectedPoint.coverage === "no-tracked-records" && <div className="empty-state"><strong>No tracked facility records</strong><p>This means no qualifying record in the frozen release—not zero data-center capacity, demand, or activity.</p></div>}
                    <div className="evidence-columns">
                      <section><p className="eyebrow"><ProvenanceBadge kind="Reported" /> Electricity · {selectedContext?.electricity.sourceDate ?? "unavailable"}</p><dl><div><dt>Retail sales</dt><dd>{selectedContext?.electricity.retailSalesTwh != null ? `${number(selectedContext.electricity.retailSalesTwh, 1)} TWh` : "—"}</dd></div><div><dt>Commercial price</dt><dd>{selectedContext?.electricity.averageCommercialPriceCentsPerKwh != null ? `${number(selectedContext.electricity.averageCommercialPriceCentsPerKwh, 2)} ¢/kWh` : "—"}</dd></div><div><dt>Generation mix</dt><dd>{selectedContext ? `${number(selectedContext.electricity.generationMixPct.renewable ?? 0, 1)}% renewable · ${number(selectedContext.electricity.generationMixPct.nuclear ?? 0, 1)}% nuclear` : "—"}</dd></div></dl></section>
                      <section><p className="eyebrow"><ProvenanceBadge kind="Reported" /> Water & drought</p><dl><div><dt>2015 freshwater</dt><dd>{selectedContext?.water.freshwaterWithdrawalsMgd != null ? `${number(selectedContext.water.freshwaterWithdrawalsMgd, 1)} MGD` : "—"}</dd></div><div><dt>D1–D4 area</dt><dd>{selectedContext?.drought.d1D4Pct != null ? `${number(selectedContext.drought.d1D4Pct, 1)}%` : "—"}</dd></div><div><dt>D3–D4 area</dt><dd>{selectedContext?.drought.d3D4Pct != null ? `${number(selectedContext.drought.d3D4Pct, 1)}%` : "—"}</dd></div></dl></section>
                    </div>
                    <section className="policy-timeline"><p className="eyebrow">State policy evidence</p><div className="policy-coverage-row"><span className={`freshness ${selectedPolicyCoverage?.freshness ?? "unavailable"}`}>{selectedPolicyCoverage?.coverageStatus.replaceAll("-", " ") ?? "unavailable"}</span><strong>{selectedReviewedPolicies.length} reviewed · {selectedCandidatePolicies.length} candidates · {selectedPoint.activePolicyMechanisms.length} effects</strong></div>{selectedPolicies.length ? selectedPolicies.map((instrument) => <a key={instrument.id} href={instrument.primarySourceUrl ?? instrument.discoverySourceUrl ?? "#"} target="_blank" rel="noreferrer"><time>{instrument.reviewStatus === "candidate" ? "Candidate" : instrument.effectiveFrom ?? "Date pending"}</time><span>{instrument.title}</span></a>) : <p>{selectedPolicyCoverage?.note}</p>}<small>Candidate, pending, qualitative, expired, or unapproved items remain model-inactive.</small></section>
                    <div className="quality-strip"><span className={`freshness ${selectedContext?.electricity.freshness ?? "unavailable"}`}>EIA {selectedContext?.electricity.freshness ?? "unavailable"}</span><span className={`freshness ${selectedContext?.water.freshness ?? "unavailable"}`}>USGS {selectedContext?.water.freshness ?? "unavailable"}</span><span className={`freshness ${selectedContext?.drought.freshness ?? "unavailable"}`}>Drought {selectedContext?.drought.freshness ?? "unavailable"}</span></div>
                    <div className="primary-links">{selectedContext?.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</div>
                    {selectedFacility && <FacilityDetail facility={selectedFacility} geographyContext={geographyContextState.context} compactMode />}
                  </> : <div className="empty-state"><strong>National view</strong><p>Select any state to inspect its reported resource context, evidence freshness, policy coverage, and primary sources.</p></div>}
                </aside>
              </div>
              <SourceLineageDrawer layer={mapLayer} context={selectedContext} modelVersion={MODEL_VERSION} />
            </section>

            <section className="state-table-section section-pad">
              <div className="section-heading"><div><p className="eyebrow">50-state synchronized ledger</p><h2>Ranking, context, and evidence coverage</h2></div><p className="section-note">Rows re-rank with the selected period and scenario. Click a state to update every view.</p></div>
              <StateForecastTable rows={stateRows} selectedState={selectedState} onSelectState={(state) => { setSelectedState(state); setSelectedFacilityId(null); window.location.hash = "cockpit"; }} animationKey={`${scenarioId}-${selectedPeriod.period}-${comparisonMode}`} />
            </section>
          </>
        )}

        {view === "facilities" && (
          <section className="page-section section-pad">
            <div className="page-title">
              <div><p className="eyebrow">Canonical entity registry</p><h1>Facilities</h1></div>
              <p>Campuses are kept separate from owners, users, projects, phases, and source documents. City-level coordinates protect precision while preserving state analysis.</p>
            </div>
            <div className="facility-toolbar">
              <label><span>Search records</span><input type="search" value={facilitySearch} onChange={(event) => setFacilitySearch(event.target.value)} placeholder="Facility, operator, state…" /></label>
              <div className="quality-summary"><strong>{filteredFacilityRows.length}</strong><span>records in view</span></div>
              <div className="quality-summary warning"><strong>{reviewCount}</strong><span>need analyst review</span></div>
              <div className="export-actions">
                <button onClick={() => exportFacilityCsv(filteredFacilityRows)}>Export view CSV ↓</button>
                <button onClick={copyCitation}>{citationCopied ? "Citation copied ✓" : "Copy release citation"}</button>
              </div>
            </div>
            <div className="facility-layout">
              <div className="facility-table-wrap">
                <table className="facility-table">
                  <thead><tr><th>Facility</th><th>AI evidence</th><th>Stage</th><th>Power</th><th>Adjustment</th><th>Review</th></tr></thead>
                  <tbody>
                    {filteredFacilityRows.map((facility) => (
                      <tr key={facility.id} className={selectedFacilityId === facility.id ? "selected" : ""} onClick={() => handleFacilitySelect(facility)}>
                        <td><button onClick={() => handleFacilitySelect(facility)}><strong>{facility.name}</strong><span>{facility.city}, {facility.state} · {facility.operator}</span></button></td>
                        <td><strong>{facility.aiClass}</strong><span className={`confidence ${facility.aiConfidence}`}>{facility.aiConfidence}</span></td>
                        <td><span className="stage-pill">{facility.stage.replaceAll("-", " ")}</span></td>
                        <td><strong>{number(facility.facilityMw.value)} MW</strong><ProvenanceBadge kind={facility.facilityMw.provenance} /></td>
                        <td>{percent(facility.completionProbability)}</td>
                        <td><span className={`review-pill ${facility.analystReview}`}>{facility.analystReview.replace("-", " ")}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <aside className="facility-detail-pane">
                {selectedFacility ? <FacilityDetail facility={selectedFacility} geographyContext={geographyContextState.context} /> : <div className="empty-state"><strong>Select a record</strong><p>Inspect provenance, AI evidence, uncertainty, status notes, and calculation sheets.</p></div>}
              </aside>
            </div>
          </section>
        )}

        {view === "scenarios" && (
          <ScenarioExplorer selected={scenario} onSelect={(id) => setScenarioId(id)} records={filterByScope(facilities, "qualified-ai")} />
        )}

        {view === "policy" && (
          <section className="page-section section-pad">
            <div className="page-title">
              <div><p className="eyebrow">Human-reviewed policy intelligence</p><h1>Policy & law</h1></div>
              <p>The public index found 38 state incentive candidates. None is a legal finding or forecast input until controlling text and current status are reviewed.</p>
            </div>
            <div className="audit-summary" aria-label="Policy data run summary">
              <article><span>Secondary candidates</span><strong>{statePolicyRelease.metadata.instrumentCount}</strong><small>NCSL index updated {statePolicyRelease.metadata.publicIndexUpdated ?? "unknown"}</small></article>
              <article><span>Reviewed state instruments</span><strong>{statePolicyRelease.coverage.reduce((sum, row) => sum + row.reviewedInstrumentIds.length, 0)}</strong><small>Primary-source legal review incomplete</small></article>
              <article><span>Approved model effects</span><strong>{statePolicyEffects.length}</strong><small>Unreviewed records cannot change forecasts</small></article>
              <article><span>Bill discovery</span><strong>Blocked</strong><small>OPENSTATES_API_KEY unavailable in this run</small></article>
            </div>
            <div className="section-heading policy-coverage-heading"><div><p className="eyebrow">Explicit 50-state discovery coverage</p><h2>Inspect one state at a time</h2></div><label className="compact-select"><span>Selected state</span><select value={selectedState ?? "TX"} onChange={(event) => setSelectedState(event.target.value)}>{stateCodes.map((state) => <option key={state} value={state}>{state} · {STATE_NAMES[state]}</option>)}</select></label></div>
            <div className="policy-coverage-grid">{statePolicyRelease.coverage.map((row) => <button key={row.state} className={selectedState === row.state ? "active" : ""} onClick={() => setSelectedState(row.state)}><strong>{row.state}</strong><span>{STATE_NAMES[row.state]}</span><i>{row.candidateInstrumentIds.length} candidate{row.candidateInstrumentIds.length === 1 ? "" : "s"}</i></button>)}</div>
            <section className="selected-policy-review" aria-live="polite">
              <div><p className="eyebrow">{selectedState ? `${STATE_NAMES[selectedState]} · ${selectedState}` : "Select a state"}</p><h2>Discovery record</h2><p>{selectedPolicyCoverage?.note}</p></div>
              <div className="candidate-list">
                {selectedCandidatePolicies.map((instrument) => <article key={instrument.id}><span className="document-pill">{instrument.reviewStatus}</span><h3>{instrument.title}</h3><p>{instrument.summary}</p><div>{instrument.primarySourceUrl && <a href={instrument.primarySourceUrl} target="_blank" rel="noreferrer">Official citation candidate ↗</a>}<a href={instrument.discoverySourceUrl ?? statePolicyRelease.metadata.discoveryIndexes[0]} target="_blank" rel="noreferrer">Discovery index ↗</a></div></article>)}
                {selectedCandidatePolicies.length === 0 && <div className="empty-state"><strong>No dedicated incentive candidate in this index</strong><p>This does not mean no applicable law, bill, tariff, docket, local rule, agency decision, or announcement.</p></div>}
              </div>
            </section>
            <div className="section-heading policy-coverage-heading"><div><p className="eyebrow">Federal context</p><h2>Current proceedings retained separately</h2></div><p className="section-note">These records remain qualitative unless a reviewed quantitative effect is approved.</p></div>
            <div className="policy-list">
              {policyItems.map((item) => (
                <article key={item.id} className="policy-card">
                  <div className="policy-card-top"><span className="document-pill">{item.documentType}</span><span className={`review-pill ${item.analystReview}`}>{item.analystReview.replaceAll("-", " ")}</span></div>
                  <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a></h2>
                  <p>{item.issuingBody} · {item.jurisdiction}</p>
                  <dl>
                    <DefinitionTerm term="Legal status">{item.legalStatus}</DefinitionTerm>
                    <DefinitionTerm term="Published">{item.publicationDate}</DefinitionTerm>
                    <DefinitionTerm term="Effective">{item.effectiveDate}</DefinitionTerm>
                    <DefinitionTerm term="Proposed relevance">{item.proposedImpact}</DefinitionTerm>
                  </dl>
                </article>
              ))}
            </div>
            <div className="legal-note"><strong>Not legal advice.</strong> This explorer separates primary legal documents from analyst interpretation. Always consult the controlling text, docket, and qualified counsel.</div>
          </section>
        )}

        {view === "sources" && (
          <section className="page-section section-pad">
            <div className="page-title">
              <div><p className="eyebrow">Live audit · {dataRunRelease.metadata.runDate}</p><h1>Sources & data run</h1></div>
              <p>The run is intentionally marked partial: credible source coverage is broad, but current bill discovery, primary legal review, and an upstream facility update remain unresolved.</p>
            </div>
            <section className="data-run-panel">
              <div className="data-run-head"><div><p className="eyebrow">Machine-readable run ledger</p><h2>{dataRunRelease.metadata.overallStatus} release</h2></div><p>{dataRunRelease.metadata.stateContextRecords} resource rows · {dataRunRelease.metadata.statePolicyCoverageRecords} policy-coverage rows · {dataRunRelease.metadata.candidatePolicyInstruments} candidates</p></div>
              <div className="data-run-grid">{dataRunRelease.checks.map((check) => <article key={check.id}><div><span>{check.category}</span><i className={`run-status ${check.status}`}>{check.status.replaceAll("-", " ")}</i></div><h3><a href={check.sourceUrl} target="_blank" rel="noreferrer">{check.label} ↗</a></h3><strong>{check.stateCoverage}</strong><p>{check.note}</p><small>Source date {check.sourceDate}</small></article>)}</div>
              <details><summary>Known gaps <span>{dataRunRelease.gaps.length}</span></summary><ul>{dataRunRelease.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></details>
            </section>
            <div className="section-heading registry-heading"><div><p className="eyebrow">Coverage, cadence, license, gaps</p><h2>Credible source registry</h2></div><p className="section-note">Inclusion means the source is usable for a stated purpose—not that it is complete, current, causal, or legally controlling.</p></div>
            <div className="source-grid">
              {sources.map((source) => (
                <article key={source.id} className="source-card">
                  <div className="source-card-head"><ProvenanceBadge kind={source.provenance} /><span>{source.automated ? "Automatable" : "Manual review"}</span></div>
                  <h2><a href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a></h2>
                  <p className="source-publisher">{source.publisher}</p>
                  <dl>
                    <DefinitionTerm term="Measures">{source.measures}</DefinitionTerm>
                    <DefinitionTerm term="Coverage">{source.coverage}</DefinitionTerm>
                    <DefinitionTerm term="Cadence">{source.cadence}</DefinitionTerm>
                    <DefinitionTerm term="Access">{source.access}</DefinitionTerm>
                    <DefinitionTerm term="License">{source.license}</DefinitionTerm>
                    <DefinitionTerm term="Known gaps">{source.gaps}</DefinitionTerm>
                  </dl>
                  <footer><span>AI-specific: {source.aiSpecific ? "yes" : "no"}</span><span>Accessed {source.accessedAt}</span></footer>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "methodology" && (
          <Methodology />
        )}
      </main>

      <footer className="site-footer">
        <div><span className="brand-mark">K/P</span><p>Key of Providence<br /><small>U.S. AI Infrastructure Observatory</small></p></div>
        <p>Research release · Source-linked · Reproducible<br /><small>Analytical estimates are not utility measurements, legal advice, or investment advice.</small></p>
        <div><a href="https://epoch.ai/data/data-centers-documentation" target="_blank" rel="noreferrer">Epoch AI data credit ↗</a><button onClick={() => setView("methodology")}>Methodology</button></div>
      </footer>
    </div>
  );
}

function FacilityDetail({ facility, geographyContext, compactMode = false }: { facility: FacilityRecord; geographyContext: GeographyContextRelease | null; compactMode?: boolean }) {
  const county = geographyContext?.county.facilities[facility.id] ?? null;
  const watershed = geographyContext?.watershed.facilities[facility.id] ?? null;
  const aquifer = geographyContext?.aquifer.facilities[facility.id] ?? null;
  const balancingAuthority = geographyContext?.balancingAuthority.facilities[facility.id] ?? null;
  const utilityTerritory = geographyContext?.utilityTerritory.facilities[facility.id] ?? null;
  const { timeline: upstreamTimeline, failed: timelineFailed } = useEpochTimeline(facility.upstreamName ?? facility.name);
  const recentTimeline = upstreamTimeline ? [...upstreamTimeline.timeline].reverse().slice(0, compactMode ? 2 : 5) : [];
  const recentHardware = upstreamTimeline ? [...upstreamTimeline.hardwareDeployments].reverse().slice(0, compactMode ? 2 : 5) : [];
  return (
    <article className={`facility-detail ${compactMode ? "compact" : ""}`}>
      <div className="facility-detail-head">
        <div><p className="eyebrow">{facility.id}</p><h3>{facility.name}</h3><p>{facility.city}, {facility.state} · city-level display point</p></div>
        <span className={`review-pill ${facility.analystReview}`}>{facility.analystReview.replace("-", " ")}</span>
      </div>
      <div className="facility-detail-metrics">
        <div><span>Facility power</span><strong>{number(facility.facilityMw.value)} MW</strong><ProvenanceBadge kind={facility.facilityMw.provenance} /></div>
        <div><span>Peak compute</span><strong>{compact(facility.h100Equivalents.value)} H100e</strong><ProvenanceBadge kind={facility.h100Equivalents.provenance} /></div>
        <div><span>Completion weight</span><strong>{percent(facility.completionProbability)}</strong><ProvenanceBadge kind="Forecast" /></div>
      </div>
      <dl>
        <DefinitionTerm term="Operator">{facility.operator}</DefinitionTerm>
        <DefinitionTerm term="Users">{facility.users.length ? facility.users.join(", ") : "Unknown"}</DefinitionTerm>
        <DefinitionTerm term="AI classification"><strong>{facility.aiClass}</strong> · {facility.aiConfidence} confidence. {facility.aiEvidence}</DefinitionTerm>
        <DefinitionTerm term="Project stage"><strong>{facility.stage.replaceAll("-", " ")}</strong> · {facility.stageConfidence} confidence. {facility.stageNote}</DefinitionTerm>
        {county && <DefinitionTerm term="County crosswalk"><strong>{county.countyName}</strong> · FIPS {county.countyFips} · {county.confidence} confidence. <ProvenanceBadge kind={county.provenance} /> {county.disclosure}</DefinitionTerm>}
        {watershed && <DefinitionTerm term="Watershed crosswalk"><strong>{watershed.watershedName}</strong> · HUC-8 {watershed.huc8} · {watershed.confidence} confidence. <ProvenanceBadge kind={watershed.provenance} /> {watershed.disclosure}</DefinitionTerm>}
        {aquifer && <DefinitionTerm term="Principal-aquifer context"><strong>{aquifer.principalAquifers.map((candidate) => candidate.aquiferName ?? "Unnamed polygon").join("; ") || "No polygon returned"}</strong> · {aquifer.confidence} locator confidence. <ProvenanceBadge kind={aquifer.provenance} /> {aquifer.disclosure}</DefinitionTerm>}
        {balancingAuthority && <DefinitionTerm term="Provisional control area"><strong>{balancingAuthority.candidates.map((candidate) => candidate.authorityName ?? "Unnamed polygon").join("; ") || "Unresolved"}</strong> · {balancingAuthority.assignmentStatus.replaceAll("-", " ")} · excluded from forecast inputs. <ProvenanceBadge kind={balancingAuthority.provenance} /> {balancingAuthority.disclosure}</DefinitionTerm>}
        {utilityTerritory && <DefinitionTerm term="Provisional retail utility"><strong>{utilityTerritory.candidates.map((candidate) => candidate.utilityName ?? "Unnamed polygon").join("; ") || "Unresolved"}</strong> · {utilityTerritory.assignmentStatus.replaceAll("-", " ")} · excluded from forecast inputs. <ProvenanceBadge kind={utilityTerritory.provenance} /> {utilityTerritory.disclosure}</DefinitionTerm>}
        {!compactMode && <DefinitionTerm term="Derivation">{facility.facilityMw.method} Uncertainty parameter: ±{facility.facilityMw.uncertaintyPct}%.</DefinitionTerm>}
      </dl>
      <div className="source-links">
        <p className="eyebrow">Evidence links</p>
        {facility.sourceLinks.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><span>Tier {source.tier}</span>{source.label} ↗</a>)}
        <a href={facility.calculationSheet} target="_blank" rel="noreferrer"><span>Method</span>Calculation sheet ↗</a>
      </div>
      {!compactMode && <LocalReviewWorkbench facility={facility} />}
      {recentTimeline.length > 0 && (
        <div className="timeline-block">
          <div className="timeline-heading"><p className="eyebrow">Dated upstream timeline</p><ProvenanceBadge kind="Estimated" /></div>
          <p className="timeline-caveat">Epoch-derived milestones and calculations; not meter readings. Newest first.</p>
          {recentTimeline.map((point) => (
            <div className="timeline-event" key={`${facility.id}-${point.date}`}>
              <time dateTime={point.date}>{point.date}</time>
              <div>
                <strong>{point.facilityPowerMw == null ? "Capacity not stated" : `${number(point.facilityPowerMw)} facility MW`}</strong>
                <span>{point.itPowerMw == null ? "IT MW unavailable" : `${number(point.itPowerMw)} IT MW`} · {point.buildingsOperational == null ? "building count unavailable" : `${point.buildingsOperational} buildings operational`}</span>
                {!compactMode && <p>{point.constructionStatus || "No construction-status note in this timeline row."}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {timelineFailed && <div className="empty-state"><strong>Timeline unavailable</strong><p>The frozen facility profile is still shown, but the dated release asset failed to load. Verify the release path and checksum before analysis.</p></div>}
      {recentHardware.length > 0 && (
        <div className="hardware-block">
          <div className="timeline-heading"><p className="eyebrow">Hardware deployment evidence</p><ProvenanceBadge kind="Estimated" /></div>
          <p className="timeline-caveat">Units and chip types retain Epoch’s dated source fields; theoretical stock is not effective utilization.</p>
          <div className="hardware-list">
            {recentHardware.map((deployment, index) => (
              <div key={`${facility.id}-${deployment.date}-${deployment.chipType}-${index}`}>
                <time dateTime={deployment.date}>{deployment.date || "Date unavailable"}</time>
                <strong>{deployment.chipType || "Chip type unresolved"}</strong>
                <span>{deployment.units == null ? "Units unavailable" : `${number(deployment.units)} units`} · {deployment.user || deployment.owner || "User/owner unresolved"}</span>
                {!compactMode && deployment.unitsSource && (
                  deployment.unitsSource.startsWith("https://")
                    ? <a href={deployment.unitsSource} target="_blank" rel="noreferrer">Unit evidence ↗</a>
                    : <small>Unit source class: {deployment.unitsSource}</small>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function LocalReviewWorkbench({ facility }: { facility: FacilityRecord }) {
  const { receipts, allReceipts, append } = useReviewReceipts(facility.id);
  const [reviewerAlias, setReviewerAlias] = useState("");
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<"approve-draft" | "retain-needs-review">("retain-needs-review");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const receipt = await append({ reviewerAlias, reason, decision });
      setReason("");
      setMessage(`Local receipt ${receipt.receiptHash.slice(0, 12)}… saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review receipt could not be saved.");
    }
  };

  return (
    <section className="review-workbench" aria-labelledby={`review-${facility.id}`}>
      <div className="timeline-heading"><p className="eyebrow" id={`review-${facility.id}`}>Local analyst notebook</p><span className="review-pill needs-review">unsigned draft</span></div>
      <p className="timeline-caveat">Receipts persist only in this browser and never change published data or forecasts. SHA-256 chaining helps detect accidental edits; it is not identity authentication or a production approval signature.</p>
      <form onSubmit={handleSubmit}>
        <label><span>Reviewer alias</span><input value={reviewerAlias} onChange={(event) => setReviewerAlias(event.target.value)} placeholder="Initials or local handle" /></label>
        <label><span>Draft decision</span><select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><option value="retain-needs-review">Retain needs review</option><option value="approve-draft">Approve as local draft</option></select></label>
        <label className="review-reason"><span>Evidence-based reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What source, field, or calculation did you check?" /></label>
        <div className="review-actions"><button type="submit" className="secondary-button">Append local receipt</button><button type="button" onClick={() => downloadReviewReceipts(allReceipts)} disabled={allReceipts.length === 0}>Export all receipts</button></div>
      </form>
      {message && <p className="review-message" role="status">{message}</p>}
      {receipts.slice().reverse().slice(0, 3).map((receipt) => <div className="review-receipt" key={receipt.receiptId}><time dateTime={receipt.createdAt}>{receipt.createdAt}</time><strong>{receipt.decision.replaceAll("-", " ")} · {receipt.reviewerAlias}</strong><p>{receipt.reason}</p><code>{receipt.receiptHash.slice(0, 20)}…</code></div>)}
    </section>
  );
}

function ScenarioExplorer({ selected, onSelect, records }: { selected: Scenario; onSelect: (id: string) => void; records: FacilityRecord[] }) {
  const baseline2030 = forecastCapacity(records, scenarios[0]).find((point) => point.year === 2030)!.centralMw;
  const selected2030 = forecastCapacity(records, selected).find((point) => point.year === 2030)!.centralMw;
  const baselineResources = deriveResources(baseline2030, scenarios[0]);
  const selectedScenarioResources = deriveResources(selected2030, selected);
  const groupedStates = new Map<string, FacilityRecord[]>();
  records.forEach((facility) => groupedStates.set(facility.state, [...(groupedStates.get(facility.state) ?? []), facility]));
  const rankingFor = (scenario: Scenario) => [...groupedStates].map(([state, rows]) => ({
    state,
    mw: forecastCapacity(rows, scenario).find((point) => point.year === 2030)!.centralMw,
  })).sort((a, b) => b.mw - a.mw);
  const baselineRanking = rankingFor(scenarios[0]);
  const selectedRanking = rankingFor(selected);
  const rankMoves = selectedRanking.slice(0, 6).map((row, index) => ({
    ...row,
    selectedRank: index + 1,
    baselineRank: baselineRanking.findIndex((item) => item.state === row.state) + 1,
  }));
  const bindingChanges = Object.entries(selected.constraintMultipliers)
    .filter(([, value]) => value !== 1)
    .sort((a, b) => Math.abs(1 - b[1]) - Math.abs(1 - a[1]));
  const deltaText = (value: number, baselineValue: number, unit: string) => {
    const delta = value - baselineValue;
    return `${delta >= 0 ? "+" : ""}${number(delta, unit === "TWh" || unit === "MGD" ? 1 : 0)} ${unit}`;
  };
  return (
    <section className="page-section section-pad">
      <div className="page-title">
        <div><p className="eyebrow">Versioned parameter bundles</p><h1>Scenario engine</h1></div>
        <p>Scenarios are conditional “what if” paths. They are not assigned probabilities and do not rewrite the source snapshot.</p>
      </div>
      <div className="scenario-banner"><strong>{selected.name}</strong><span>{selected.description}</span><ProvenanceBadge kind={selected.id === "baseline" ? "Forecast" : "Scenario output"} /></div>
      <div className="scenario-comparison">
        <div className="comparison-metrics">
          <p className="eyebrow">2030 delta from baseline</p>
          <div><span>Facility power</span><strong>{selected.id === "baseline" ? "Reference" : deltaText(selected2030, baseline2030, "MW")}</strong></div>
          <div><span>IT power</span><strong>{selected.id === "baseline" ? "Reference" : deltaText(selectedScenarioResources.itMw, baselineResources.itMw, "IT MW")}</strong></div>
          <div><span>Annual electricity</span><strong>{selected.id === "baseline" ? "Reference" : deltaText(selectedScenarioResources.annualTwh, baselineResources.annualTwh, "TWh")}</strong></div>
          <div><span>Direct water</span><strong>{selected.id === "baseline" ? "Reference" : deltaText(selectedScenarioResources.directWaterMgd, baselineResources.directWaterMgd, "MGD")}</strong></div>
        </div>
        <div className="rank-moves">
          <p className="eyebrow">State ranking movement</p>
          {rankMoves.map((row) => <div key={row.state}><strong>{row.state}</strong><span>#{row.baselineRank} → #{row.selectedRank}</span><i>{number(row.mw)} MW</i></div>)}
        </div>
        <div className="binding-changes">
          <p className="eyebrow">Changed constraint multipliers</p>
          {bindingChanges.length ? bindingChanges.map(([constraint, multiplier]) => <div key={constraint}><strong>{constraint}</strong><span>{number(multiplier, 2)}× baseline</span></div>) : <p>Baseline multipliers are the reference bundle.</p>}
          <small>{selected.sourceRationale}</small>
        </div>
      </div>
      <div className="scenario-grid">
        {scenarios.map((scenario) => {
          const point2030 = forecastCapacity(records, scenario).find((point) => point.year === 2030)!;
          const delta = (point2030.centralMw / baseline2030 - 1) * 100;
          const tightest = Object.entries(scenario.constraintMultipliers).sort((a, b) => a[1] - b[1])[0];
          return (
            <article key={scenario.id} className={`scenario-card ${selected.id === scenario.id ? "selected" : ""}`}>
              <div className="scenario-card-number">{String(scenarios.indexOf(scenario) + 1).padStart(2, "0")}</div>
              <h2>{scenario.name}</h2>
              <p>{scenario.description}</p>
              <div className="scenario-delta"><span>2030 vs baseline</span><strong>{scenario.id === "baseline" ? "Reference" : `${delta >= 0 ? "+" : ""}${number(delta, 1)}%`}</strong></div>
              <dl>
                <div><dt>Annual growth</dt><dd>{percent(scenario.annualGrowth)}</dd></div>
                <div><dt>Tightest multiplier</dt><dd>{tightest[0]} · {number(tightest[1], 2)}</dd></div>
                <div><dt>Ramp</dt><dd>{scenario.startYear} / {scenario.rampYears} yr</dd></div>
              </dl>
              <ul>{scenario.changedParameters.map((parameter) => <li key={parameter}>{parameter}</li>)}</ul>
              <button className="secondary-button" onClick={() => onSelect(scenario.id)}>{selected.id === scenario.id ? "Selected" : "Use scenario"}</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Methodology() {
  return (
    <section className="page-section section-pad methodology-page">
      <div className="page-title">
        <div><p className="eyebrow">Definitions, equations, limitations</p><h1>Methodology & releases</h1></div>
        <p>Release 0.2 is a transparent, source-linked pilot—not a census of U.S. data centers and not a calibrated production forecast.</p>
      </div>
      <div className="methodology-grid">
        <article>
          <p className="eyebrow">Measurement dictionary</p><h2>Power is not one number</h2>
          <dl>
            <DefinitionTerm term="Facility power (MW)">Peak or nameplate site power including IT equipment and facility overhead. Source values here are Epoch estimates.</DefinitionTerm>
            <DefinitionTerm term="IT power (MW)">Power delivered to servers, storage, and network equipment. Derived as facility MW ÷ PUE.</DefinitionTerm>
            <DefinitionTerm term="Operational MW">Only the operating share of a project phase. Under-construction capacity is zero operational MW.</DefinitionTerm>
            <DefinitionTerm term="Probability-adjusted MW">{probabilityAdjustedEquation}</DefinitionTerm>
            <DefinitionTerm term="Annual electricity (TWh)">Facility MW × load factor × 8,760 hours ÷ 1,000,000. It is not peak demand.</DefinitionTerm>
            <DefinitionTerm term="H100 equivalent">Theoretical peak 8-bit operations-per-second equivalence. It is not measured utilization, training compute, or annual effective operations.</DefinitionTerm>
            <DefinitionTerm term="Apparent supply MVA">Facility MW ÷ an explicit 0.95 power-factor screening assumption. It does not determine transformer count, redundancy, voltage, topology, firm service, or interconnection rights.</DefinitionTerm>
            <DefinitionTerm term="Land acreage">Reported parcel/campus acres only. Release 0.2 has no verified acreage for its 18 curated records and refuses a universal MW-to-acre conversion.</DefinitionTerm>
          </dl>
        </article>
        <article>
          <p className="eyebrow">AI classification</p><h2>Evidence, not logos</h2>
          <p>Cloud ownership is not enough. A facility is “qualified AI” here only when it is AI-primary, or AI-significant with medium/high confidence. Low-confidence speculative workloads remain visible in “All catalogued.”</p>
          <dl>
            <DefinitionTerm term="AI-primary">Direct evidence that AI training/inference is the principal workload.</DefinitionTerm>
            <DefinitionTerm term="AI-significant">Material AI use is supported, but the site may also serve other workloads.</DefinitionTerm>
            <DefinitionTerm term="Mixed">AI and non-AI workload shares are both material and evidenced.</DefinitionTerm>
            <DefinitionTerm term="General / unknown">No sufficient AI-specific evidence; included only for context.</DefinitionTerm>
            <DefinitionTerm term="Government / defense">A distinct class; sensitive locations must be aggregated or withheld.</DefinitionTerm>
          </dl>
        </article>
        <article>
          <p className="eyebrow">Forecast architecture</p><h2>Hybrid stock and transition model</h2>
          <p>Release 0.2 calculates known-project ramps per facility and reconciles them to state and national totals; unannounced growth remains state-level. Active scenario and approved policy factors constrain only the growth channel. This establishes reproducible semantics; it does not claim statistical calibration.</p>
          <ol>
            <li>Freeze the source snapshot as of {AS_OF_DATE}.</li>
            <li>Separate operational share from incomplete project capacity.</li>
            <li>Apply documented completion weights by facility phase.</li>
            <li>Ramp known probability-adjusted capacity toward commissioning.</li>
            <li>Add a constrained unannounced-capacity term.</li>
            <li>Propagate an explicit widening interval.</li>
          </ol>
        </article>
        <article>
          <p className="eyebrow">Water semantics</p><h2>Direct is not indirect</h2>
          <p>The dashboard currently estimates direct cooling consumption only from IT energy and a scenario WUE. It does not add water used by electricity generation, does not claim withdrawals equal consumption, and does not infer local availability from a national coefficient.</p>
          <dl>
            <DefinitionTerm term="Direct consumption">Water evaporated or otherwise not returned by on-site cooling.</DefinitionTerm>
            <DefinitionTerm term="Direct withdrawal">Water taken from a source; may be larger than consumption.</DefinitionTerm>
            <DefinitionTerm term="Indirect water">Water associated with electricity generation and upstream supply; excluded from the current metric.</DefinitionTerm>
          </dl>
        </article>
        <article>
          <div className="source-card-head"><p className="eyebrow">Calibration gate</p><span className="review-pill needs-review">blocked</span></div>
          <h2>No historical-evidence shortcut</h2>
          <p>{calibrationReadiness.releaseDecision}</p>
          <dl>
            {calibrationReadiness.criteria.map((criterion) => (
              <DefinitionTerm key={criterion.id} term={criterion.label}><strong>{criterion.observed} / {criterion.required}</strong> · {criterion.passed ? "passed" : "not met"}</DefinitionTerm>
            ))}
            <DefinitionTerm term="Leakage rule">{calibrationReadiness.evidence.exclusionReason}</DefinitionTerm>
            <DefinitionTerm term="Implemented score functions">{calibrationReadiness.implementedMetrics.join("; ")}.</DefinitionTerm>
          </dl>
        </article>
      </div>
      <div className="release-history">
        <p className="eyebrow">What changed since the prior release</p>
        <div className="release-row"><strong>0.2.0</strong><span>{AS_OF_DATE}</span><p>Added all 50 states, Alaska/Hawaii insets, synchronized playback and URL state, facility-first reconciliation, aligned MW/electricity/water paths, state resource context, explicit policy-coverage gaps, current-view export, and source lineage.</p><code>{DATASET_VERSION} · {MODEL_VERSION}</code></div>
        <div className="release-row"><strong>0.1.0</strong><span>Prior</span><p>Reproducible pilot with the licensed U.S. Epoch snapshot, dated project and hardware timelines, geography crosswalks, deterministic resource conversions, scenario bundles, and a policy review gate.</p><code>kop-forecast-0.1.0</code></div>
        <div className="release-row future"><strong>Next gate</strong><span>Unpublished</span><p>Serving-utility and topology-confirmed BA/ISO assignments, hindcast calibration, signed analyst approvals, and historical as-of replay.</p><code>No release claim</code></div>
      </div>
      <div className="geography-contract">
        <div className="section-heading">
          <div><p className="eyebrow">Crosswalk readiness</p><h2>States are navigation—not the analytical limit</h2></div>
          <p className="section-note">Every assignment retains boundary vintage and admits conflicts. Electrical and water service relationships can override geometric containment.</p>
        </div>
        <div className="geography-table-wrap">
          <table className="geography-table">
            <thead><tr><th>Layer</th><th>Status</th><th>Boundary/version rule</th><th>Analytical purpose</th><th>Conflict and uncertainty rule</th></tr></thead>
            <tbody>
              {geographyLayers.map((layer) => (
                <tr key={layer.id}>
                  <td><strong>{layer.label}</strong><span>{layer.analyticalUnit}</span></td>
                  <td><span className={`geo-status ${layer.status}`}>{layer.status.replace("-", " ")}</span></td>
                  <td>{layer.boundaryVersion}<small>Source: {layer.sourceId}</small></td>
                  <td>{layer.purpose}<small>{layer.crosswalkRule}</small></td>
                  <td>{layer.uncertaintyHandling}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="limitations">
        <div><p className="eyebrow">Known limitations</p><h2>What this release cannot yet tell you</h2></div>
        <ul>
          <li>The registry is a curated subset of a 74-record dataset, not a national census.</li>
          <li>City-level map points are approximate display coordinates, not parcel centroids.</li>
          <li>Completion probabilities are transparent demonstration priors and have not been hindcast-calibrated.</li>
          <li>State constraint labels are analytical placeholders pending serving-utility and topology-confirmed balancing-authority data.</li>
          <li>Water is a coefficient-based direct-consumption scenario, not a facility water-use observation.</li>
          <li>No news or policy item changes a forecast without human review and a new model release.</li>
        </ul>
      </div>
    </section>
  );
}

export default App;
