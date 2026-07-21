import type { StateForecastPeriod } from "../domain/types";

type ForecastSmallMultiplesProps = {
  baseline: StateForecastPeriod[];
  comparison: StateForecastPeriod[];
  selectedPeriodIndex: number;
  comparisonLabel: string;
  referenceLabel?: string;
};

const WIDTH = 520;
const HEIGHT = 142;
const MARGIN = { top: 18, right: 16, bottom: 25, left: 49 };
const pathFrom = (points: Array<[number, number]>) =>
  points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

const chartDefinitions = [
  { key: "centralMw", low: "lowMw", high: "highMw", label: "Facility capacity", unit: "MW", digits: 0 },
  { key: "annualTwh", low: "annualTwh", high: "annualTwh", label: "Annual electricity", unit: "TWh/year", digits: 1 },
  { key: "directWaterMgd", low: "directWaterMgd", high: "directWaterMgd", label: "Direct cooling water", unit: "MGD", digits: 1 },
] as const;

export function ForecastSmallMultiples({ baseline, comparison, selectedPeriodIndex, comparisonLabel, referenceLabel = "Baseline" }: ForecastSmallMultiplesProps) {
  const selected = Math.min(selectedPeriodIndex, comparison.length - 1);
  const minTime = comparison[0]?.timeIndex ?? 2026.5;
  const maxTime = comparison.at(-1)?.timeIndex ?? 2040;
  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (time: number) => MARGIN.left + ((time - minTime) / (maxTime - minTime)) * innerWidth;

  return (
    <div className="small-multiples" aria-label="Synchronized forecast charts">
      {chartDefinitions.map((definition) => {
        const values = [...baseline, ...comparison].flatMap((point) => [point[definition.low], point[definition.high], point[definition.key]]);
        const maximum = Math.max(...values, 1);
        const y = (value: number) => MARGIN.top + innerHeight - (value / maximum) * innerHeight;
        const uncertainty = [
          ...comparison.map((point) => [x(point.timeIndex), y(point[definition.high])] as [number, number]),
          ...[...comparison].reverse().map((point) => [x(point.timeIndex), y(point[definition.low])] as [number, number]),
        ];
        const selectedPoint = comparison[selected];
        return (
          <article className="mini-chart" key={definition.key}>
            <header>
              <span>{definition.label}</span>
              <strong>{selectedPoint?.[definition.key].toLocaleString(undefined, { maximumFractionDigits: definition.digits }) ?? "—"} <small>{definition.unit}</small></strong>
            </header>
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${definition.label} baseline and ${comparisonLabel} forecast`}>
              {[0, maximum / 2, maximum].map((tick) => <g key={tick}>
                <line className="chart-grid" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} />
                <text className="chart-label" x={MARGIN.left - 7} y={y(tick) + 3} textAnchor="end">{tick.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })}</text>
              </g>)}
              <path className="forecast-area animated-path" d={`${pathFrom(uncertainty)} Z`} />
              <path className="baseline-line animated-path" d={pathFrom(baseline.map((point) => [x(point.timeIndex), y(point[definition.key])]))} />
              <path className="scenario-line animated-path" d={pathFrom(comparison.map((point) => [x(point.timeIndex), y(point[definition.key])]))} />
              <line className="selected-year-line" x1={x(selectedPoint?.timeIndex ?? minTime)} x2={x(selectedPoint?.timeIndex ?? minTime)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
              {[2026.5, 2030, 2035, 2040].map((time) => <text key={time} className="chart-label" x={x(time)} y={HEIGHT - 7} textAnchor="middle">{time === 2026.5 ? "2026" : time}</text>)}
            </svg>
          </article>
        );
      })}
      <div className="chart-key compact-key"><span><i className="key-line baseline" />{referenceLabel}</span><span><i className="key-line scenario" />{comparisonLabel}</span><span><i className="key-area" />Interval</span></div>
    </div>
  );
}
