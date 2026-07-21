import { useMemo, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import statesTopology from "us-atlas/states-10m.json";
import type { FacilityRecord } from "../domain/types";
import { STATE_ABBR } from "../data/states";

type MapFeature = {
  type: "Feature";
  id?: string | number;
  properties: { name?: string };
  geometry: GeoJSON.Geometry;
};

type UsMapProps = {
  facilities: FacilityRecord[];
  values: Map<string, number | null>;
  facilityForecastMw?: Map<string, number>;
  selectedState: string | null;
  selectedFacilityId: string | null;
  onSelectState: (state: string) => void;
  onSelectFacility: (facility: FacilityRecord) => void;
  metricLabel: string;
  metricDescription?: string;
};

const WIDTH = 920;
const HEIGHT = 555;
const EMPTY_COLOR = "#14221d";
const formatCompact = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export function UsMap({
  facilities,
  values,
  facilityForecastMw = new Map(),
  selectedState,
  selectedFacilityId,
  onSelectState,
  onSelectFacility,
  metricLabel,
  metricDescription,
}: UsMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [hoveredFacility, setHoveredFacility] = useState<FacilityRecord | null>(null);

  const { features, path, projection } = useMemo(() => {
    const topology = statesTopology as { objects: { states: Parameters<typeof feature>[1] } };
    const collection = feature(statesTopology as never, topology.objects.states) as unknown as { type: "FeatureCollection"; features: MapFeature[] };
    const allStates = collection.features.filter((item) => Boolean(STATE_ABBR[item.properties.name ?? ""]));
    const allStatesCollection = { type: "FeatureCollection" as const, features: allStates };
    const fittedProjection = geoAlbersUsa().fitExtent([[18, 18], [WIDTH - 18, HEIGHT - 18]], allStatesCollection);
    return { features: allStates, projection: fittedProjection, path: geoPath(fittedProjection) };
  }, []);

  const finiteValues = [...values.values()].filter((value): value is number => value != null && Number.isFinite(value));
  const maximum = Math.max(...finiteValues.map(Math.abs), 1);
  const minimum = Math.min(...finiteValues, 0);
  const diverging = minimum < 0;
  const colorForValue = (value: number | null | undefined) => {
    if (value == null) return "url(#missing-evidence)";
    if (diverging) {
      const intensity = Math.min(1, Math.abs(value) / maximum);
      return value < 0 ? `hsl(28 76% ${31 + intensity * 27}%)` : `hsl(155 58% ${25 + intensity * 34}%)`;
    }
    if (value === 0) return EMPTY_COLOR;
    const normalized = Math.log1p(Math.max(0, value)) / Math.log1p(maximum);
    return `hsl(155 ${36 + normalized * 30}% ${18 + normalized * 45}%)`;
  };

  const activeState = hoveredState ?? selectedState;
  const activeValue = activeState ? values.get(activeState) : null;

  return (
    <div className="map-wrap">
      <svg className="us-map" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-labelledby="map-title map-description">
        <title id="map-title">United States synchronized state forecast map</title>
        <desc id="map-description">All 50 states, including Alaska and Hawaii insets, are shaded by {metricLabel}. {metricDescription} Facility centers stay fixed; filled bubbles show forecast known-project capacity and outer rings show catalogued capacity ceilings.</desc>
        <defs>
          <pattern id="missing-evidence" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#121d1a" /><line x1="0" y1="0" x2="0" y2="8" stroke="#53625c" strokeWidth="2" />
          </pattern>
          <filter id="point-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <g className="state-layer">
          {features.map((stateFeature) => {
            const stateName = stateFeature.properties.name ?? "";
            const abbreviation = STATE_ABBR[stateName];
            const value = values.get(abbreviation);
            const selected = selectedState === abbreviation;
            const valueText = value == null ? "no released value" : `${formatCompact(value)} ${metricLabel}`;
            return <path
              key={String(stateFeature.id ?? stateName)}
              d={path(stateFeature) ?? undefined}
              fill={colorForValue(value)}
              className={`state-shape ${selected ? "selected" : ""} ${value == null ? "missing" : ""}`}
              tabIndex={0}
              role="button"
              aria-label={`${stateName}: ${valueText}`}
              onMouseEnter={() => setHoveredState(abbreviation)}
              onMouseLeave={() => setHoveredState(null)}
              onFocus={() => setHoveredState(abbreviation)}
              onBlur={() => setHoveredState(null)}
              onClick={() => onSelectState(abbreviation)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectState(abbreviation); } }}
            />;
          })}
        </g>
        <g className="facility-layer" aria-label="Tracked facility forecast bubbles">
          {facilities.map((facility) => {
            const point = projection([facility.longitude, facility.latitude]);
            if (!point) return null;
            const selected = selectedFacilityId === facility.id;
            const muted = selectedState !== null && selectedState !== facility.state;
            const catalogRadius = 3.8 + Math.sqrt(facility.facilityMw.value) / 9;
            const knownMw = Math.max(0, facilityForecastMw.get(facility.id) ?? facility.facilityMw.value * facility.completionProbability);
            const knownRadius = Math.min(catalogRadius, catalogRadius * Math.sqrt(knownMw / Math.max(1, facility.facilityMw.value)));
            return <g key={facility.id} className={`facility-symbol ${muted ? "muted" : ""}`}>
              <circle cx={point[0]} cy={point[1]} r={catalogRadius} className="facility-ceiling" aria-hidden="true" />
              <circle
                cx={point[0]} cy={point[1]} r={selected ? Math.max(knownRadius, 7) : knownRadius}
                className={`facility-dot ${selected ? "selected" : ""}`}
                filter={selected ? "url(#point-glow)" : undefined}
                tabIndex={0} role="button"
                aria-label={`${facility.name}, ${facility.city}, ${facility.state}; ${Math.round(knownMw)} forecast known-project MW of ${facility.facilityMw.value} catalogued MW`}
                onMouseEnter={() => setHoveredFacility(facility)} onMouseLeave={() => setHoveredFacility(null)}
                onFocus={() => setHoveredFacility(facility)} onBlur={() => setHoveredFacility(null)}
                onClick={(event) => { event.stopPropagation(); onSelectFacility(facility); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectFacility(facility); } }}
              />
            </g>;
          })}
        </g>
      </svg>

      <div className="map-status" aria-live="polite">
        {hoveredFacility ? <><span className="eyebrow">Forecast bubble · fixed city point</span><strong>{hoveredFacility.name}</strong><span>{Math.round(facilityForecastMw.get(hoveredFacility.id) ?? 0).toLocaleString()} known-project MW · {hoveredFacility.facilityMw.value.toLocaleString()} MW ceiling</span></>
          : activeState ? <><span className="eyebrow">State layer</span><strong>{activeState}</strong><span>{activeValue == null ? "No released value" : `${formatCompact(activeValue)} ${metricLabel}`}</span></>
          : <><span className="eyebrow">Explore all 50 states</span><strong>Select a state or facility</strong><span>Hatched states mean missing evidence, never an inferred zero.</span></>}
      </div>
      <div className="map-legend" aria-label="Map color legend"><span>{diverging ? `−${formatCompact(maximum)}` : "0"}</span><span className={`legend-gradient ${diverging ? "diverging" : ""}`} /><span>{formatCompact(maximum)} {metricLabel}</span><span className="missing-key"><i />Missing</span></div>
    </div>
  );
}
