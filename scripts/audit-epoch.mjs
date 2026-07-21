import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse } from "csv-parse/sync";

const getArgument = (name) => {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const asOf = getArgument("--as-of") ?? "2026-07-21";
const directory = path.resolve("data", "raw", "epoch-ai", asOf);
const body = await readFile(path.join(directory, "data_centers.csv"), "utf8");
const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
const records = parse(body, { columns: true, skip_empty_lines: true, relax_quotes: true });
const checksum = createHash("sha256").update(body).digest("hex");
const unitedStates = records.filter((record) => record.Country === "United States");
const invalidPower = records.filter((record) => !Number.isFinite(Number(record["Current power (MW)"])));
const missingSource = records.filter((record) => !record["Selected Sources"]?.trim());
const packageChecks = await Promise.all(Object.entries(manifest.package_files ?? {}).map(async ([name, expected]) => {
  const bytes = await readFile(path.join(directory, name));
  const actualChecksum = createHash("sha256").update(bytes).digest("hex");
  const actualRows = name.endsWith(".csv")
    ? parse(bytes, { columns: true, skip_empty_lines: true, relax_quotes: true }).length
    : undefined;
  return {
    name,
    checksum_matches: actualChecksum === expected.sha256,
    row_count_matches: actualRows === undefined || actualRows === expected.record_count,
  };
}));
const checks = {
  checksum_matches: checksum === manifest.sha256,
  row_count_matches: records.length === manifest.record_count,
  invalid_power_rows: invalidPower.length,
  records_missing_selected_sources: missingSource.length,
  package_files_verified: packageChecks.length,
  package_files_valid: packageChecks.every((check) => check.checksum_matches && check.row_count_matches),
};

process.stdout.write(`${JSON.stringify({ asOf, totalRecords: records.length, unitedStatesRecords: unitedStates.length, checks }, null, 2)}\n`);
if (!checks.checksum_matches || !checks.row_count_matches || !checks.package_files_valid || checks.invalid_power_rows > 0) process.exitCode = 1;
