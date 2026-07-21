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
const datasetDoi = "https://doi.org/10.5066/P9Y2HOUJ";
const datasetPublicationDate = "2003-10-01";
const datasetScale = "1:2,500,000";
const wfsUrl = "https://www.usgs.gov/apps/ngwmn/geoserver/ngwmn/wfs";
const featureType = "ngwmn:aquifrp025";
const outputDirectory = path.resolve("data", "derived", "geography", asOf);
const outputPath = path.join(outputDirectory, "principal-aquifer-crosswalk.json");
const generatedPath = path.resolve("src", "data", "generated", "principal-aquifer-crosswalk.json");
const publicPath = path.resolve("public", "data", "releases", asOf, "principal-aquifer-crosswalk.json");

if (!force) {
  try {
    await access(outputPath, constants.F_OK);
    throw new Error(`Principal-aquifer crosswalk already exists at ${outputPath}. Use a new --as-of date or pass --force before publication.`);
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
      const response = await fetch(url, { headers: { "user-agent": "Key-of-Providence/0.1 principal-aquifer-crosswalk" } });
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

  const queryUrl = new URL(wfsUrl);
  queryUrl.search = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName: featureType,
    outputFormat: "application/json",
    propertyName: "ROCK_TYPE,ROCK_NAME,AQ_NAME,AQ_CODE,NAT_AQFR_CD",
    // GeoServer WFS 1.1 applies EPSG:4326 axis order as latitude, longitude.
    CQL_FILTER: `INTERSECTS(GEOM,POINT(${latitude} ${longitude}))`,
  });
  const aquiferResponse = await requestJson(queryUrl);
  const distinct = new Map();
  for (const feature of aquiferResponse.features ?? []) {
    const properties = feature.properties ?? {};
    const candidate = {
      aquiferName: properties.AQ_NAME ?? null,
      aquiferCode: properties.AQ_CODE == null ? null : String(properties.AQ_CODE),
      nationalAquiferCode: properties.NAT_AQFR_CD ?? null,
      rockName: properties.ROCK_NAME ?? null,
      rockTypeCode: properties.ROCK_TYPE == null ? null : String(properties.ROCK_TYPE),
    };
    const key = JSON.stringify(candidate);
    distinct.set(key, candidate);
  }
  const principalAquifers = [...distinct.values()];
  const mapped = principalAquifers.length > 0;

  rows.push({
    facilityId: facility.id,
    upstreamName,
    mapped,
    principalAquifers,
    rawFeatureCount: aquiferResponse.features?.length ?? 0,
    distinctFeatureCount: principalAquifers.length,
    overlapStatus: principalAquifers.length > 1 ? "multiple-distinct-polygons" : principalAquifers.length === 1 ? "single-polygon" : "not-mapped",
    locatorMethod,
    provenance: locatorMethod === "address-range-transient-coordinate" ? "Estimated" : "Imputed",
    confidence: locatorMethod === "address-range-transient-coordinate" ? "medium" : "low",
    sourceAddressSha256: sourceAddress ? createHash("sha256").update(sourceAddress).digest("hex") : null,
    addressLookupError,
    disclosure: mapped
      ? `Spatial intersection with the shallowest principal-aquifer map at ${datasetScale}; this is not evidence of a facility water source, well, withdrawal, water right, or groundwater use.`
      : `No polygon was returned by the ${datasetPublicationDate.slice(0, 4)} principal-aquifer layer at this locator. This does not mean groundwater or local aquifers are absent.`,
  });
}

const output = {
  metadata: {
    source: "USGS Principal Aquifers of the United States",
    sourceUrl: datasetDoi,
    serviceUrl: wfsUrl,
    featureType,
    accessedAt: asOf,
    datasetPublicationDate,
    sourceScale: datasetScale,
    facilityCount: rows.length,
    mappedCount: rows.filter((row) => row.mapped).length,
    unmappedCount: rows.filter((row) => !row.mapped).length,
    multipleDistinctPolygonCount: rows.filter((row) => row.distinctFeatureCount > 1).length,
    addressRangeMatchCount: rows.filter((row) => row.locatorMethod === "address-range-transient-coordinate").length,
    cityCentroidFallbackCount: rows.filter((row) => row.locatorMethod === "city-centroid-fallback").length,
    sensitiveCoordinatesStored: false,
    license: "U.S. government public-domain data; USGS data release DOI 10.5066/P9Y2HOUJ.",
    useConstraints: "The layer maps the shallowest principal aquifer at regional scale. It does not identify actual facility water supply, groundwater use, withdrawal rights, or local aquifer conditions.",
  },
  facilities: Object.fromEntries(rows.map((row) => [row.facilityId, row])),
};

await mkdir(outputDirectory, { recursive: true });
await mkdir(path.dirname(generatedPath), { recursive: true });
await mkdir(path.dirname(publicPath), { recursive: true });
const serialized = `${JSON.stringify(output, null, 2)}\n`;
await Promise.all([writeFile(outputPath, serialized, "utf8"), writeFile(generatedPath, serialized, "utf8"), writeFile(publicPath, serialized, "utf8")]);
process.stdout.write(`${JSON.stringify({ outputPath, ...output.metadata }, null, 2)}\n`);
