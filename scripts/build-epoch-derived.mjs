import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const rawDirectory = path.resolve("data", "raw", "epoch-ai", asOf);
const publicOutputDirectory = path.resolve("public", "data", "releases", asOf);
const outputPath = path.join(publicOutputDirectory, "epoch-timelines.json");
const generatedDirectory = path.resolve("src", "data", "generated");
const hardwareOutputPath = path.join(generatedDirectory, "epoch-hardware.json");

const readCsv = async (name) => parse(
  await readFile(path.join(rawDirectory, name), "utf8"),
  { columns: true, skip_empty_lines: true, relax_quotes: true },
);
const centers = await readCsv("data_centers.csv");
const timelines = await readCsv("data_center_timelines.csv");
const chipQuantities = await readCsv("data_center_chip_quantities.csv");
const manifest = JSON.parse(await readFile(path.join(rawDirectory, "manifest.json"), "utf8"));
const numeric = (value) => value === "" || value == null ? null : Number(value);

const byName = new Map();
for (const center of centers.filter((record) => record.Country === "United States")) {
  byName.set(center.Name, {
    country: center.Country,
    address: center.Address,
    owner: center.Owner,
    users: center.Users,
    selectedSourcesMarkdown: center["Selected Sources"],
    calculationSheet: center["Calculations sheet"],
    timeline: [],
    hardwareDeployments: [],
  });
}

for (const row of timelines) {
  const center = byName.get(row["Data center"]);
  if (!center) continue;
  center.timeline.push({
    date: row.Date,
    constructionStatus: row["Construction status"],
    buildingsOperational: numeric(row["Buildings operational"]),
    itPowerMw: numeric(row["IT power (MW)"]),
    facilityPowerMw: numeric(row["Power (MW)"]),
    h100Equivalents: numeric(row["H100 equivalents"]),
    performance8BitOps: numeric(row["Performance (8-bit OP/s)"]),
    waterUseMgd: numeric(row["Water use (MGD)"]),
    provenance: "Estimated",
  });
}

for (const row of chipQuantities) {
  const center = byName.get(row["Data center"]);
  if (!center) continue;
  center.hardwareDeployments.push({
    date: row.Date,
    chipType: row["Chip type"],
    units: numeric(row["Number of Units"]),
    chipTypeSource: row["Chip type source"],
    unitsSource: row["Number of Units source"],
    owner: row.Owner,
    user: row.User,
    notes: row.Notes,
    provenance: "Estimated",
  });
}

for (const center of byName.values()) {
  center.timeline.sort((a, b) => a.date.localeCompare(b.date));
  center.hardwareDeployments.sort((a, b) => a.date.localeCompare(b.date));
}

const output = {
  metadata: {
    generatedFrom: `data/raw/epoch-ai/${asOf}`,
    accessedAt: asOf,
    upstreamSha256: manifest.sha256,
    upstreamTimelineSha256: manifest.package_files["data_center_timelines.csv"].sha256,
    provenance: "Estimated",
    facilityCount: byName.size,
    timelineCount: [...byName.values()].reduce((sum, center) => sum + center.timeline.length, 0),
    hardwareDeploymentCount: [...byName.values()].reduce((sum, center) => sum + center.hardwareDeployments.length, 0),
    note: "Epoch timeline values are estimates/calculations based on its documented methodology; they are not utility meter readings.",
  },
  facilities: Object.fromEntries([...byName.entries()].sort(([a], [b]) => a.localeCompare(b))),
};

const hardwareOutput = {
  metadata: {
    generatedFrom: output.metadata.generatedFrom,
    accessedAt: output.metadata.accessedAt,
    upstreamSha256: output.metadata.upstreamSha256,
    hardwareDeploymentCount: output.metadata.hardwareDeploymentCount,
    provenance: "Estimated",
  },
  facilities: Object.fromEntries(
    Object.entries(output.facilities).map(([name, center]) => [name, center.hardwareDeployments]),
  ),
};

await mkdir(publicOutputDirectory, { recursive: true });
await mkdir(generatedDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await writeFile(hardwareOutputPath, `${JSON.stringify(hardwareOutput, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, hardwareOutputPath, facilityCount: output.metadata.facilityCount, timelineCount: output.metadata.timelineCount, hardwareDeploymentCount: output.metadata.hardwareDeploymentCount }, null, 2)}\n`);
