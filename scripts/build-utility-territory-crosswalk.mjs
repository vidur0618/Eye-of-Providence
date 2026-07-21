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
const serviceUrl = "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0";
const sourceItemUrl = "https://www.arcgis.com/home/item.html?id=597555ce8e4a4892a030784a7c657fdd";
const sourceItemId = "597555ce8e4a4892a030784a7c657fdd";
const sourceSnapshotDate = "2025-08-21";
const outputDirectory = path.resolve("data", "derived", "geography", asOf);
const outputPath = path.join(outputDirectory, "utility-territory-crosswalk.json");
const generatedPath = path.resolve("src", "data", "generated", "utility-territory-crosswalk.json");
const publicPath = path.resolve("public", "data", "releases", asOf, "utility-territory-crosswalk.json");

if (!force) {
  try {
    await access(outputPath, constants.F_OK);
    throw new Error(`Utility-territory crosswalk already exists at ${outputPath}. Use a new --as-of date or pass --force before publication.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const { facilities } = await import("../src/data/catalog.ts");
const timelineRelease = JSON.parse(await readFile(path.resolve("public", "data", "releases", asOf, "epoch-timelines.json"), "utf8"));
const requestJson = async (url, attempts = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "Key-of-Providence/0.1 utility-territory-crosswalk" } });
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
    outFields: "ID,NAME,TYPE,STATE,SOURCE,SOURCEDATE,VAL_METHOD,VAL_DATE,WEBSITE,REGULATED,CNTRL_AREA,PLAN_AREA,HOLDING_CO,YEAR",
    returnGeometry: "false",
    f: "json",
  });
  const response = await requestJson(queryUrl);
  if (response.error) throw new Error(`Utility-territory query failed for ${facility.id}: ${JSON.stringify(response.error)}`);
  const distinct = new Map();
  for (const feature of response.features ?? []) {
    const attributes = feature.attributes ?? {};
    const candidate = {
      utilityId: attributes.ID ?? null,
      utilityName: attributes.NAME ?? null,
      utilityType: attributes.TYPE ?? null,
      utilityState: attributes.STATE ?? null,
      regulated: attributes.REGULATED ?? null,
      controlArea: attributes.CNTRL_AREA ?? null,
      planningArea: attributes.PLAN_AREA ?? null,
      holdingCompany: attributes.HOLDING_CO ?? null,
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
      ? "HIFLD retail-territory polygon containment only. Confirm the actual provider, tariff/service class, special contract, effective date, and interconnection arrangement before analytical use."
      : "The public-use territory layer returned no polygon. The serving utility remains unknown and is not inferred from state, proximity, or holding-company identity.",
  });
}

const output = {
  metadata: {
    source: "HIFLD Electric Retail Service Territories",
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
    credits: "Oak Ridge National Laboratory and DOE Office of Cybersecurity, Energy Security, and Emergency Response.",
    useConstraints: "Retail territory is a geometric screening candidate, not confirmation of the actual large-load provider, tariff, special contract, or interconnection. Every row is excluded from forecast inputs pending primary evidence.",
  },
  facilities: Object.fromEntries(rows.map((row) => [row.facilityId, row])),
};

await Promise.all([mkdir(outputDirectory, { recursive: true }), mkdir(path.dirname(generatedPath), { recursive: true }), mkdir(path.dirname(publicPath), { recursive: true })]);
const serialized = `${JSON.stringify(output, null, 2)}\n`;
await Promise.all([writeFile(outputPath, serialized, "utf8"), writeFile(generatedPath, serialized, "utf8"), writeFile(publicPath, serialized, "utf8")]);
process.stdout.write(`${JSON.stringify({ outputPath, ...output.metadata }, null, 2)}\n`);
