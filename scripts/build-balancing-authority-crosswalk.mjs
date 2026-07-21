import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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
const force = process.argv.includes("--force");
const benchmark = "Public_AR_Current";
const vintage = "Current_Current";
const serviceUrl = "https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/Control_Areas/FeatureServer/0";
const sourceItemUrl = "https://www.arcgis.com/home/item.html?id=17499e6de9104f7288ce2ccc9239bc98";
const sourceItemId = "17499e6de9104f7288ce2ccc9239bc98";
const sourceSnapshotDate = "2021-12-08";
const outputDirectory = path.resolve("data", "derived", "geography", asOf);
const outputPath = path.join(outputDirectory, "balancing-authority-crosswalk.json");
const generatedPath = path.resolve("src", "data", "generated", "balancing-authority-crosswalk.json");
const publicPath = path.resolve("public", "data", "releases", asOf, "balancing-authority-crosswalk.json");

if (!force) {
  try {
    await access(outputPath, constants.F_OK);
    throw new Error(`Balancing-authority crosswalk already exists at ${outputPath}. Use a new --as-of date or pass --force before publication.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const { facilities } = await import("../src/data/catalog.ts");
const timelineRelease = JSON.parse(
  await readFile(path.resolve("public", "data", "releases", asOf, "epoch-timelines.json"), "utf8"),
);

const requestJson = async (url, attempts = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "Key-of-Providence/0.1 balancing-authority-crosswalk" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    }
  }
  throw lastError;
};

const toIsoDate = (value) => {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

const rows = [];
for (const facility of facilities) {
  const upstreamName = facility.upstreamName ?? facility.name;
  const sourceAddress = timelineRelease.facilities[upstreamName]?.address ?? "";
  let longitude = facility.longitude;
  let latitude = facility.latitude;
  let locatorMethod = "city-centroid-fallback";
  let addressLookupError = null;

  if (sourceAddress) {
    try {
      const addressUrl = new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
      addressUrl.search = new URLSearchParams({ address: sourceAddress, benchmark, vintage, format: "json" });
      const response = await requestJson(addressUrl);
      const match = response.result?.addressMatches?.[0];
      if (match?.coordinates) {
        longitude = match.coordinates.x;
        latitude = match.coordinates.y;
        locatorMethod = "address-range-transient-coordinate";
      }
    } catch (error) {
      addressLookupError = String(error.message ?? error);
    }
  }

  const queryUrl = new URL(`${serviceUrl}/query`);
  queryUrl.search = new URLSearchParams({
    geometry: `${longitude},${latitude}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "ID,NAME,SOURCE,SOURCEDATE,VAL_METHOD,VAL_DATE,WEBSITE,YEAR",
    returnGeometry: "false",
    f: "json",
  });
  const response = await requestJson(queryUrl);
  if (response.error) throw new Error(`Control-area query failed for ${facility.id}: ${JSON.stringify(response.error)}`);

  const distinct = new Map();
  for (const feature of response.features ?? []) {
    const attributes = feature.attributes ?? {};
    const candidate = {
      authorityId: attributes.ID ?? null,
      authorityName: attributes.NAME ?? null,
      featureSource: attributes.SOURCE ?? null,
      featureSourceDate: toIsoDate(attributes.SOURCEDATE),
      validationMethod: attributes.VAL_METHOD ?? null,
      validationDate: toIsoDate(attributes.VAL_DATE),
      website: attributes.WEBSITE ?? null,
      featureYear: attributes.YEAR == null ? null : String(attributes.YEAR),
    };
    distinct.set(JSON.stringify(candidate), candidate);
  }
  const candidates = [...distinct.values()];

  rows.push({
    facilityId: facility.id,
    upstreamName,
    candidates,
    matchCount: candidates.length,
    assignmentStatus: candidates.length === 1 ? "unconfirmed-geometric" : candidates.length > 1 ? "ambiguous-geometric" : "unresolved",
    locatorMethod,
    provenance: locatorMethod === "address-range-transient-coordinate" ? "Estimated" : "Imputed",
    confidence: "low",
    eligibleForForecastInputs: false,
    sourceAddressSha256: sourceAddress ? createHash("sha256").update(sourceAddress).digest("hex") : null,
    addressLookupError,
    disclosure: candidates.length > 0
      ? "Legacy HIFLD polygon containment only. Confirm the serving utility, interconnection, electrical topology, and effective-date relationship before using this assignment analytically."
      : "The legacy HIFLD layer returned no polygon. The balancing authority remains unknown and is not inferred from state or ISO/RTO geography.",
  });
}

const output = {
  metadata: {
    source: "Homeland Infrastructure Foundation-Level Data (HIFLD) — Control Areas",
    sourceItemUrl,
    sourceItemId,
    serviceUrl,
    sourceSnapshotDate,
    accessedAt: asOf,
    facilityCount: rows.length,
    singleMatchCount: rows.filter((row) => row.matchCount === 1).length,
    ambiguousMatchCount: rows.filter((row) => row.matchCount > 1).length,
    unresolvedCount: rows.filter((row) => row.matchCount === 0).length,
    addressRangeMatchCount: rows.filter((row) => row.locatorMethod === "address-range-transient-coordinate").length,
    cityCentroidFallbackCount: rows.filter((row) => row.locatorMethod === "city-centroid-fallback").length,
    sensitiveCoordinatesStored: false,
    license: "None (Public Use). Users are advised to read the dataset metadata and limitations.",
    credits: "ORNL, LANL, INL, and the NGA Homeland Security Infrastructure Program Team.",
    useConstraints: "A legacy geometric control-area polygon is a screening hint, not proof of the serving utility or current balancing-authority relationship. Every row is excluded from forecast inputs pending confirmation.",
  },
  facilities: Object.fromEntries(rows.map((row) => [row.facilityId, row])),
};

await mkdir(outputDirectory, { recursive: true });
await mkdir(path.dirname(generatedPath), { recursive: true });
await mkdir(path.dirname(publicPath), { recursive: true });
const serialized = `${JSON.stringify(output, null, 2)}\n`;
await Promise.all([writeFile(outputPath, serialized, "utf8"), writeFile(generatedPath, serialized, "utf8"), writeFile(publicPath, serialized, "utf8")]);
process.stdout.write(`${JSON.stringify({ outputPath, ...output.metadata }, null, 2)}\n`);
