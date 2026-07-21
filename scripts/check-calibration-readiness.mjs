import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";

const getArgument = (name) => {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const asOf = getArgument("--as-of") ?? "2026-07-21";
const check = process.argv.includes("--check");
const rawRoot = path.resolve("data", "raw", "epoch-ai");
const outcomeRoot = path.resolve("data", "validation", "outcomes");
const outputDirectory = path.resolve("data", "validation", asOf);
const outputPath = path.join(outputDirectory, "calibration-readiness.json");
const generatedPath = path.resolve("src", "data", "generated", "calibration-readiness.json");

const existingDirectories = async (directory) => {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
};

const snapshotDates = await existingDirectories(rawRoot);
const validSnapshotDates = [];
for (const date of snapshotDates) {
  try {
    await access(path.join(rawRoot, date, "manifest.json"), constants.F_OK);
    validSnapshotDates.push(date);
  } catch {
    // An unmanifested folder is not a frozen evaluation cutoff.
  }
}

let outcomeFiles = [];
try {
  outcomeFiles = (await readdir(outcomeRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const criteria = [
  {
    id: "historical-cutoffs",
    label: "At least three independently frozen historical source cutoffs",
    required: 3,
    observed: validSnapshotDates.length,
    passed: validSnapshotDates.length >= 3,
  },
  {
    id: "subsequent-outcomes",
    label: "At least one independent subsequent-outcome release",
    required: 1,
    observed: outcomeFiles.length,
    passed: outcomeFiles.length >= 1,
  },
  {
    id: "minimum-cohort",
    label: "At least 30 resolved project outcomes after leakage checks",
    required: 30,
    observed: 0,
    passed: false,
  },
];
const passed = criteria.every((criterion) => criterion.passed);
const output = {
  metadata: {
    asOf,
    modelVersion: "kop-forecast-0.1.0",
    generatedBy: "scripts/check-calibration-readiness.mjs",
    status: passed ? "ready-for-evaluation" : "blocked-insufficient-historical-evidence",
    calibrationClaimAllowed: false,
  },
  evidence: {
    frozenEpochSnapshotDates: validSnapshotDates,
    independentOutcomeFiles: outcomeFiles,
    currentSnapshotTimelineRowsExcludedAsHindcasts: true,
    exclusionReason: "Historical-looking rows inside a current upstream snapshot may contain retrospective knowledge and are not independent as-of forecasts.",
  },
  criteria,
  implementedMetrics: [
    "mean absolute capacity error",
    "Brier score",
    "interval coverage",
    "mean absolute timing error",
    "Spearman regional rank correlation",
    "parent-child reconciliation relative error",
  ],
  releaseDecision: passed
    ? "The data prerequisites exist, but a named calibration run and reviewed scorecard are still required before any coverage claim."
    : "Do not label forecast intervals calibrated or fit completion weights from this release. Preserve more historical cutoffs and independent outcomes first.",
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (check) {
  const [frozen, generated] = await Promise.all([readFile(outputPath, "utf8"), readFile(generatedPath, "utf8")]);
  if (frozen !== serialized || generated !== serialized) {
    throw new Error("Calibration-readiness artifacts do not match the current frozen evidence. Regenerate deliberately before release.");
  }
} else {
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(path.dirname(generatedPath), { recursive: true });
  await Promise.all([writeFile(outputPath, serialized, "utf8"), writeFile(generatedPath, serialized, "utf8")]);
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
