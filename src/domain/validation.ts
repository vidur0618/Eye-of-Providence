const requirePairs = (left: number[], right: number[]) => {
  if (left.length === 0 || left.length !== right.length) {
    throw new Error("Evaluation arrays must be non-empty and have equal length.");
  }
};

export const meanAbsoluteError = (predicted: number[], actual: number[]) => {
  requirePairs(predicted, actual);
  return predicted.reduce((sum, value, index) => sum + Math.abs(value - actual[index]), 0) / predicted.length;
};

export const brierScore = (probability: number[], outcome: number[]) => {
  requirePairs(probability, outcome);
  probability.forEach((value) => {
    if (value < 0 || value > 1) throw new Error("Probabilities must be between zero and one.");
  });
  outcome.forEach((value) => {
    if (value !== 0 && value !== 1) throw new Error("Brier outcomes must be binary.");
  });
  return probability.reduce((sum, value, index) => sum + (value - outcome[index]) ** 2, 0) / probability.length;
};

export const intervalCoverage = (low: number[], high: number[], actual: number[]) => {
  requirePairs(low, actual);
  requirePairs(high, actual);
  low.forEach((value, index) => {
    if (value > high[index]) throw new Error("Interval lower bounds must not exceed upper bounds.");
  });
  return actual.filter((value, index) => value >= low[index] && value <= high[index]).length / actual.length;
};

export const meanAbsoluteTimingErrorDays = (predictedIso: string[], actualIso: string[]) => {
  if (predictedIso.length === 0 || predictedIso.length !== actualIso.length) {
    throw new Error("Timing arrays must be non-empty and have equal length.");
  }
  const millisecondsPerDay = 86_400_000;
  const errors = predictedIso.map((value, index) => {
    const predicted = Date.parse(value);
    const actual = Date.parse(actualIso[index]);
    if (Number.isNaN(predicted) || Number.isNaN(actual)) throw new Error("Timing values must be valid ISO dates.");
    return Math.abs(predicted - actual) / millisecondsPerDay;
  });
  return errors.reduce((sum, value) => sum + value, 0) / errors.length;
};

export const reconciliationRelativeError = (childValues: number[], reportedParent: number) => {
  const childSum = childValues.reduce((sum, value) => sum + value, 0);
  return Math.abs(childSum - reportedParent) / Math.max(Math.abs(reportedParent), 1);
};

const averageRanks = (values: number[]) => {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = Array<number>(values.length);
  let cursor = 0;
  while (cursor < sorted.length) {
    let end = cursor + 1;
    while (end < sorted.length && sorted[end].value === sorted[cursor].value) end += 1;
    const average = (cursor + 1 + end) / 2;
    for (let index = cursor; index < end; index += 1) ranks[sorted[index].index] = average;
    cursor = end;
  }
  return ranks;
};

export const spearmanRankCorrelation = (predicted: number[], actual: number[]) => {
  requirePairs(predicted, actual);
  const x = averageRanks(predicted);
  const y = averageRanks(actual);
  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  const covariance = x.reduce((sum, value, index) => sum + (value - meanX) * (y[index] - meanY), 0);
  const varianceX = x.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  const varianceY = y.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
  if (varianceX === 0 || varianceY === 0) return null;
  return covariance / Math.sqrt(varianceX * varianceY);
};
