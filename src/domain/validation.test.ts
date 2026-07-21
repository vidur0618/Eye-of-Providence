import { describe, expect, it } from "vitest";
import {
  brierScore,
  intervalCoverage,
  meanAbsoluteError,
  meanAbsoluteTimingErrorDays,
  reconciliationRelativeError,
  spearmanRankCorrelation,
} from "./validation";

describe("hindcast evaluation metrics", () => {
  it("computes scalar error and probabilistic scores", () => {
    expect(meanAbsoluteError([10, 20, 40], [12, 18, 35])).toBeCloseTo(3);
    expect(brierScore([0.8, 0.25], [1, 0])).toBeCloseTo(0.05125);
    expect(intervalCoverage([0, 10, 20], [5, 15, 25], [3, 16, 20])).toBeCloseTo(2 / 3);
  });

  it("computes timing and reconciliation error", () => {
    expect(meanAbsoluteTimingErrorDays(["2026-01-01", "2026-02-01"], ["2026-01-03", "2026-01-28"])).toBe(3);
    expect(reconciliationRelativeError([40, 60], 110)).toBeCloseTo(10 / 110);
  });

  it("computes rank correlation with ties and refuses degenerate rankings", () => {
    expect(spearmanRankCorrelation([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
    expect(spearmanRankCorrelation([1, 2, 3], [30, 20, 10])).toBeCloseTo(-1);
    expect(spearmanRankCorrelation([1, 1, 1], [10, 20, 30])).toBeNull();
  });

  it("rejects invalid evaluation shapes instead of returning a misleading score", () => {
    expect(() => brierScore([1.2], [1])).toThrow(/between zero and one/i);
    expect(() => intervalCoverage([2], [1], [1.5])).toThrow(/lower bounds/i);
    expect(() => meanAbsoluteError([], [])).toThrow(/non-empty/i);
  });
});
