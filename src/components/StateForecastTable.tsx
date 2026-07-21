import { useMemo, useState } from "react";
import type { FreshnessStatus } from "../domain/types";

export interface StateTableRow {
  state: string;
  stateName: string;
  coverage: "tracked-records" | "no-tracked-records";
  mw: number | null;
  deltaMw: number | null;
  electricityTwh: number | null;
  waterMgd: number | null;
  electricitySharePct: number | null;
  droughtPct: number | null;
  reviewedPolicyCount: number;
  freshness: FreshnessStatus;
}

type SortKey = keyof Pick<StateTableRow, "stateName" | "mw" | "deltaMw" | "electricityTwh" | "waterMgd" | "electricitySharePct" | "droughtPct" | "reviewedPolicyCount" | "freshness">;
const freshnessRank: Record<FreshnessStatus, number> = { current: 4, aging: 3, stale: 2, unavailable: 1 };
const formatted = (value: number | null, digits = 1) => value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: digits });

export function StateForecastTable({ rows, selectedState, onSelectState, animationKey }: { rows: StateTableRow[]; selectedState: string | null; onSelectState: (state: string) => void; animationKey: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("mw");
  const [descending, setDescending] = useState(true);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const aValue = sortKey === "freshness" ? freshnessRank[a.freshness] : a[sortKey];
    const bValue = sortKey === "freshness" ? freshnessRank[b.freshness] : b[sortKey];
    if (aValue == null && bValue == null) return a.state.localeCompare(b.state);
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    const result = typeof aValue === "string" ? aValue.localeCompare(String(bValue)) : Number(aValue) - Number(bValue);
    return descending ? -result : result;
  }), [rows, sortKey, descending]);
  const chooseSort = (key: SortKey) => { if (sortKey === key) setDescending((value) => !value); else { setSortKey(key); setDescending(key !== "stateName"); } };
  const header = (key: SortKey, label: string) => <button onClick={() => chooseSort(key)} aria-label={`Sort by ${label}`}>{label}{sortKey === key ? (descending ? " ↓" : " ↑") : ""}</button>;

  return <div className="state-table-wrap">
    <table className="state-forecast-table">
      <caption>All 50 states. An em dash in forecast columns means no tracked facility records, not numeric zero.</caption>
      <thead><tr>
        <th>#</th><th>{header("stateName", "State")}</th><th>{header("mw", "Period MW")}</th><th>{header("deltaMw", "Δ baseline")}</th>
        <th>{header("electricityTwh", "TWh/year")}</th><th>{header("waterMgd", "Direct MGD")}</th><th>{header("electricitySharePct", "Share of sales")}</th>
        <th>{header("droughtPct", "D1–D4 area")}</th><th>{header("reviewedPolicyCount", "Reviewed policy")}</th><th>{header("freshness", "Freshness")}</th>
      </tr></thead>
      <tbody key={animationKey}>{sorted.map((row, index) => <tr key={row.state} className={`${selectedState === row.state ? "selected" : ""} ${row.coverage === "no-tracked-records" ? "no-tracked" : ""}`}>
        <td>{String(index + 1).padStart(2, "0")}</td>
        <td><button onClick={() => onSelectState(row.state)}><strong>{row.state}</strong><span>{row.stateName}</span></button></td>
        <td>{row.mw == null ? <span title="No tracked facility records">No tracked records</span> : formatted(row.mw, 0)}</td>
        <td>{row.deltaMw == null ? "—" : `${row.deltaMw >= 0 ? "+" : ""}${formatted(row.deltaMw, 0)}`}</td>
        <td>{formatted(row.electricityTwh)}</td><td>{formatted(row.waterMgd)}</td>
        <td>{row.electricitySharePct == null ? "—" : `${formatted(row.electricitySharePct, 2)}%`}</td>
        <td>{row.droughtPct == null ? "—" : `${formatted(row.droughtPct, 1)}%`}</td>
        <td>{row.reviewedPolicyCount}</td>
        <td><span className={`freshness ${row.freshness}`}>{row.freshness}</span></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
