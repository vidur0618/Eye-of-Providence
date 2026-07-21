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
const sourceUrl = "https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html";
const outputDirectory = path.resolve("data", "derived", "geography", asOf);
const outputPath = path.join(outputDirectory, "county-crosswalk.json");
const generatedPath = path.resolve("src", "data", "generated", "county-crosswalk.json");
const publicPath = path.resolve("public", "data", "releases", asOf, "county-crosswalk.json");

if (!force) {
  try {
    await access(outputPath, constants.F_OK);
    throw new Error(`County crosswalk already exists at ${outputPath}. Use a new --as-of date or pass --force before publication.`);
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
      const response = await fetch(url, { headers: { "user-agent": "Key-of-Providence/0.1 county-crosswalk" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    }
  }
  throw lastError;
};

const endpoint = (searchType) => new URL(`https://geocoding.geo.census.gov/geocoder/geographies/${searchType}`);
const baseParameters = { benchmark, vintage, format: "json" };
const rows = [];

for (const facility of facilities) {
  const upstreamName = facility.upstreamName ?? facility.name;
  const sourceAddress = timelineRelease.facilities[upstreamName]?.address ?? "";
  let county;
  let input;
  let method = "address-range";
  let addressLookupError = null;

  if (sourceAddress) {
    try {
      const addressUrl = endpoint("onelineaddress");
      addressUrl.search = new URLSearchParams({ ...baseParameters, address: sourceAddress });
      const response = await requestJson(addressUrl);
      const match = response.result?.addressMatches?.[0];
      county = match?.geographies?.Counties?.[0];
      input = response.result?.input;
    } catch (error) {
      addressLookupError = String(error.message ?? error);
    }
  }

  if (!county) {
    method = "city-centroid-fallback";
    const coordinateUrl = endpoint("coordinates");
    coordinateUrl.search = new URLSearchParams({
      ...baseParameters,
      x: String(facility.longitude),
      y: String(facility.latitude),
    });
    const response = await requestJson(coordinateUrl);
    county = response.result?.geographies?.Counties?.[0];
    input = response.result?.input;
  }

  rows.push({
    facilityId: facility.id,
    upstreamName,
    countyFips: county?.GEOID ?? null,
    countyName: county?.NAME ?? null,
    stateFips: county?.STATE ?? null,
    method,
    provenance: method === "address-range" ? "Estimated" : "Imputed",
    confidence: method === "address-range" ? "medium" : "low",
    boundaryVintage: input?.vintage?.vintageName ?? vintage,
    boundaryVintageId: input?.vintage?.id ?? null,
    benchmark: input?.benchmark?.benchmarkName ?? benchmark,
    benchmarkId: input?.benchmark?.id ?? null,
    sourceAddressSha256: sourceAddress ? createHash("sha256").update(sourceAddress).digest("hex") : null,
    addressLookupError,
    disclosure: method === "address-range"
      ? "County result retained; returned coordinates and matched address withheld from the public artifact."
      : "County inferred from the public city-level display point; not suitable for tract, parcel, tax, or legal-boundary claims.",
  });
}

const output = {
  metadata: {
    source: "U.S. Census Geocoding Services",
    sourceUrl,
    accessedAt: asOf,
    benchmark,
    vintage,
    facilityCount: rows.length,
    matchedCount: rows.filter((row) => row.countyFips).length,
    addressRangeMatchCount: rows.filter((row) => row.method === "address-range").length,
    cityCentroidFallbackCount: rows.filter((row) => row.method === "city-centroid-fallback").length,
    sensitiveCoordinatesStored: false,
    note: "Census geocodes are calculated from MAF/TIGER address ranges. City-centroid fallbacks are explicitly imputed and lower confidence.",
  },
  facilities: Object.fromEntries(rows.map((row) => [row.facilityId, row])),
};

await mkdir(outputDirectory, { recursive: true });
await mkdir(path.dirname(generatedPath), { recursive: true });
await mkdir(path.dirname(publicPath), { recursive: true });
const serialized = `${JSON.stringify(output, null, 2)}\n`;
await Promise.all([writeFile(outputPath, serialized, "utf8"), writeFile(generatedPath, serialized, "utf8"), writeFile(publicPath, serialized, "utf8")]);
process.stdout.write(`${JSON.stringify({ outputPath, ...output.metadata }, null, 2)}\n`);
