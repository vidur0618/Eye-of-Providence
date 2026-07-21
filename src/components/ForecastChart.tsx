import type { ForecastPoint } from "../domain/types";

type ForecastChartProps = {
  baseline: ForecastPoint[];
  comparison: ForecastPoint[];
  selectedTimeIndex: number;
  comparisonLabel: string;
};

const WIDTH = 760;
const HEIGHT = 260;
const MARGIN = { top: 18, right: 24, bottom: 34, left: 52 };

const pathFrom = (points: Array<[number, number]>) =>
  points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

export function ForecastChart({ baseline, comparison, selectedTimeIndex, comparisonLabel }: ForecastChartProps) {
  const all = [...baseline, ...comparison];
  const years = all.map((point) => point.year);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const maxValue = Math.max(...all.map((point) => point.highMw), 1);
  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (year: number) => MARGIN.left + ((year - minYear) / (maxYear - minYear)) * innerWidth;
  const y = (value: number) => MARGIN.top + innerHeight - (value / maxValue) * innerHeight;
  const selectedX = x(selectedTimeIndex);
  const comparisonArea = [
    ...comparison.map((point) => [x(point.year), y(point.highMw)] as [number, number]),
    ...[...comparison].reverse().map((point) => [x(point.year), y(point.lowMw)] as [number, number]),
  ];
  const tickYears = [2026, 2030, 2035, 2040].filter((year) => year >= minYear && year <= maxYear);
  const yTicks = [0, maxValue / 2, maxValue];

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="forecast-title forecast-desc">
        <title id="forecast-title">Facility power forecast</title>
        <desc id="forecast-desc">
          Baseline and {comparisonLabel} facility-megawatt paths from {minYear} through {maxYear}, with an uncertainty interval for the selected scenario.
        </desc>
        {yTicks.map((value) => (
          <g key={value}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(value)} y2={y(value)} className="chart-grid" />
            <text x={MARGIN.left - 10} y={y(value) + 4} textAnchor="end" className="chart-label">
              {Math.round(value).toLocaleString()}
            </text>
          </g>
        ))}
        <path d={`${pathFrom(comparisonArea)} Z`} className="forecast-area" />
        <path d={pathFrom(baseline.map((point) => [x(point.year), y(point.centralMw)]))} className="baseline-line" />
        <path d={pathFrom(comparison.map((point) => [x(point.year), y(point.centralMw)]))} className="scenario-line" />
        <line x1={selectedX} x2={selectedX} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} className="selected-year-line" />
        {tickYears.map((year) => (
          <text key={year} x={x(year)} y={HEIGHT - 10} textAnchor="middle" className="chart-label">{year}</text>
        ))}
        <text x={14} y={HEIGHT / 2} transform={`rotate(-90 14 ${HEIGHT / 2})`} textAnchor="middle" className="chart-axis-title">
          Facility MW
        </text>
      </svg>
      <div className="chart-key">
        <span><i className="key-line baseline" />Baseline</span>
        <span><i className="key-line scenario" />{comparisonLabel}</span>
        <span><i className="key-area" />Uncertainty interval</span>
      </div>
    </div>
  );
}
