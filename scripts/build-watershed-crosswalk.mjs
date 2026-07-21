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
const wbdLayerUrl = "https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer/4";
const outputDirectory = path.resolve("data", "derived", "geography", asOf);
const outputPath = path.join(outputDirectory, "huc8-crosswalk.json");
const generatedPath = path.resolve("src", "data", "generated", "huc8-crosswalk.json");
const publicPath = path.resolve("public", "data", "releases", asOf, "huc8-crosswalk.json");

if (!force) {
  try {
    await access(outputPath, constants.F_OK);
    throw new Error(`Watershed crosswalk already exists at ${outputPath}. Use a new --as-of date or pass --force before publication.`);
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
      const response = await fetch(url, { headers: { "user-agent": "Key-of-Providence/0.1 watershed-crosswalk" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    }
  }
  throw lastError;
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

  const queryUrl = new URL(`${wbdLayerUrl}/query`);
  queryUrl.search = new URLSearchParams({
    geometry: `${longitude},${latitude}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "huc8,name,states,loaddate",
    returnGeometry: "false",
    f: "json",
  });
  const watershedResponse = await requestJson(queryUrl);
  if (watershedResponse.error) throw new Error(`USGS WBD query failed for ${facility.id}: ${JSON.stringify(watershedResponse.error)}`);
  const watershed = watershedResponse.features?.[0]?.attributes;

  rows.push({
    facilityId: facility.id,
    upstreamName,
    huc8: watershed?.huc8 ?? null,
    watershedName: watershed?.name ?? null,
    states: watershed?.states ?? null,
    wbdLoadDate: watershed?.loaddate ? new Date(watershed.loaddate).toISOString() : null,
    locatorMethod,
    provenance: locatorMethod === "address-range-transient-coordinate" ? "Estimated" : "Imputed",
    confidence: locatorMethod === "address-range-transient-coordinate" ? "medium" : "low",
    sourceAddressSha256: sourceAddress ? createHash("sha256").update(sourceAddress).digest("hex") : null,
    addressLookupError,
    disclosure: locatorMethod === "address-range-transient-coordinate"
      ? "HUC-8 was queried with a transient Census address-range coordinate; the coordinate and matched address were not stored."
      : "HUC-8 was queried from the public city-level display point and is Imputed; do not use it for site-specific permitting or HUC-12 claims.",
  });
}

const output = {
  metadata: {
    source: "USGS Watershed Boundary Dataset (WBD) Map Service",
    sourceUrl: wbdLayerUrl,
    accessedAt: asOf,
    hydrologicUnit: "HUC-8 subbasin",
    facilityCount: rows.length,
    matchedCount: rows.filter((row) => row.huc8).length,
    addressRangeMatchCount: rows.filter((row) => row.locatorMethod === "address-range-transient-coordinate").length,
    cityCentroidFallbackCount: rows.filter((row) => row.locatorMethod === "city-centroid-fallback").length,
    sensitiveCoordinatesStored: false,
    useConstraints: "Open and non-proprietary; acknowledge USGS. Not intended for site-specific regulatory determinations.",
  },
  facilities: Object.fromEntries(rows.map((row) => [row.facilityId, row])),
};

await mkdir(outputDirectory, { recursive: true });
await mkdir(path.dirname(generatedPath), { recursive: true });
await mkdir(path.dirname(publicPath), { recursive: true });
const serialized = `${JSON.stringify(output, null, 2)}\n`;
await Promise.all([writeFile(outputPath, serialized, "utf8"), writeFile(generatedPath, serialized, "utf8"), writeFile(publicPath, serialized, "utf8")]);
process.stdout.write(`${JSON.stringify({ outputPath, ...output.metadata }, null, 2)}\n`);
