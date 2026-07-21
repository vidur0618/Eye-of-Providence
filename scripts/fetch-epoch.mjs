import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "csv-parse/sync";
import { strFromU8, unzipSync } from "fflate";

const SOURCE_URL = "https://epoch.ai/data/data_centers/data_centers.zip";
const getArgument = (name) => {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const asOf = getArgument("--as-of") ?? new Date().toISOString().slice(0, 10);
const force = process.argv.includes("--force");
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
  throw new Error("--as-of must use YYYY-MM-DD");
}

const releaseDirectory = path.resolve("data", "raw", "epoch-ai", asOf);
const csvPath = path.join(releaseDirectory, "data_centers.csv");
const manifestPath = path.join(releaseDirectory, "manifest.json");

if (!force) {
  try {
    await access(csvPath, constants.F_OK);
    throw new Error(`Snapshot already exists at ${csvPath}. Use a new --as-of date or pass --force.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const response = await fetch(SOURCE_URL, {
  headers: { "user-agent": "Key-of-Providence/0.1 source-snapshot" },
});
if (!response.ok) throw new Error(`Epoch download failed: ${response.status} ${response.statusText}`);
const archive = new Uint8Array(await response.arrayBuffer());
const extracted = unzipSync(archive);
const allowedFiles = new Set([
  "README.md",
  "data_centers.csv",
  "data_center_timelines.csv",
  "data_center_chip_quantities.csv",
  "data_center_chillers.csv",
  "data_center_cooling_towers.csv",
]);
const archiveFiles = Object.keys(extracted);
const unexpected = archiveFiles.filter((name) => !allowedFiles.has(name) || name.includes("..") || path.isAbsolute(name));
if (unexpected.length > 0) throw new Error(`Unexpected or unsafe files in upstream ZIP: ${unexpected.join(", ")}`);
const missingPackageFiles = [...allowedFiles].filter((name) => !(name in extracted));
if (missingPackageFiles.length > 0) throw new Error(`Upstream ZIP is missing files: ${missingPackageFiles.join(", ")}`);

const body = strFromU8(extracted["data_centers.csv"]);
const records = parse(body, { columns: true, skip_empty_lines: true, relax_quotes: true });

const requiredColumns = ["Name", "Current H100 equivalents", "Current power (MW)", "Country", "Address"];
const actualColumns = Object.keys(records[0] ?? {});
const missing = requiredColumns.filter((column) => !actualColumns.includes(column));
if (missing.length > 0) throw new Error(`Upstream schema is missing required columns: ${missing.join(", ")}`);

const checksum = createHash("sha256").update(body).digest("hex");
const packageFiles = Object.fromEntries(archiveFiles.map((name) => {
  const bytes = extracted[name];
  const isCsv = name.endsWith(".csv");
  const parsed = isCsv ? parse(strFromU8(bytes), { columns: true, skip_empty_lines: true, relax_quotes: true }) : [];
  return [name, {
    byte_length: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...(isCsv ? { record_count: parsed.length, columns: Object.keys(parsed[0] ?? {}) } : {}),
  }];
}));
const manifest = {
  source_name: "Epoch AI — AI Data Centers",
  source_url: SOURCE_URL,
  csv_url: "https://epoch.ai/data/data_centers/data_centers.csv",
  documentation_url: "https://epoch.ai/data/data-centers-documentation",
  methodology_url: "https://epoch.ai/data/data-centers-documentation/methodology",
  license: "Creative Commons Attribution (CC BY)",
  accessed_at: asOf,
  retrieved_at_utc: new Date().toISOString(),
  sha256: checksum,
  byte_length: Buffer.byteLength(body),
  record_count: records.length,
  columns: actualColumns,
  archive_sha256: createHash("sha256").update(archive).digest("hex"),
  archive_byte_length: archive.length,
  package_files: packageFiles,
  immutable_snapshot: true,
  attribution: "Epoch AI, 'AI Data Centers', https://epoch.ai/data/data-centers-documentation",
};

await mkdir(releaseDirectory, { recursive: true });
await writeFile(path.join(releaseDirectory, "data_centers.zip"), archive);
await Promise.all(Object.entries(extracted).map(([name, bytes]) => writeFile(path.join(releaseDirectory, name), bytes)));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({ csvPath, manifestPath, recordCount: records.length, packageFiles: archiveFiles.length, sha256: checksum }, null, 2)}\n`);
