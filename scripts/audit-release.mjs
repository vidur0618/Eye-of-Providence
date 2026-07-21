import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const getArgument = (name) => {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const asOf = getArgument("--as-of") ?? "2026-07-21";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const read = (value) => readFile(path.resolve(value));
const parse = async (value) => JSON.parse((await read(value)).toString("utf8"));
const fail = (message) => { throw new Error(message); };

const { facilities, scenarios, MODEL_VERSION } = await import("../src/data/catalog.ts");
const facilityIds = new Set(facilities.map((facility) => facility.id));
const releaseRoot = path.join("public", "data", "releases", asOf);
const geographyFiles = [
  ["county-crosswalk.json", "county-crosswalk.json"],
  ["huc8-crosswalk.json", "huc8-crosswalk.json"],
  ["principal-aquifer-crosswalk.json", "principal-aquifer-crosswalk.json"],
  ["balancing-authority-crosswalk.json", "balancing-authority-crosswalk.json"],
  ["utility-territory-crosswalk.json", "utility-territory-crosswalk.json"],
];
const verifiedAssets = [];

for (const [publicName, generatedName] of geographyFiles) {
  const publicBytes = await read(path.join(releaseRoot, publicName));
  const generatedBytes = await read(path.join("src", "data", "generated", generatedName));
  const derivedBytes = await read(path.join("data", "derived", "geography", asOf, publicName));
  const hashes = [publicBytes, generatedBytes, derivedBytes].map(sha256);
  if (new Set(hashes).size !== 1) fail(`${publicName} differs across public, generated, and derived release copies.`);
  const release = JSON.parse(publicBytes.toString("utf8"));
  const ids = Object.keys(release.facilities);
  if (ids.length !== facilities.length || ids.some((id) => !facilityIds.has(id))) fail(`${publicName} does not cover the exact curated facility ID set.`);
  if (release.metadata.sensitiveCoordinatesStored !== false) fail(`${publicName} does not explicitly prohibit retained sensitive coordinates.`);
  verifiedAssets.push({ file: publicName, sha256: hashes[0], records: ids.length });
}

const [timeline, manifest, calibration, rawManifest] = await Promise.all([
  parse(path.join(releaseRoot, "epoch-timelines.json")),
  parse(path.join("public", "data", "release-manifest.json")),
  parse(path.join("data", "validation", asOf, "calibration-readiness.json")),
  parse(path.join("data", "raw", "epoch-ai", asOf, "manifest.json")),
]);
if (timeline.metadata.facilityCount !== 65) fail("The public Epoch timeline release must preserve all 65 U.S. source records.");
if (manifest.facility_records !== facilities.length) fail("Release-manifest facility count does not match the rendered catalogue.");
if (rawManifest.record_count !== 74) fail("Raw Epoch manifest count does not match the frozen source package.");
if (calibration.metadata.calibrationClaimAllowed !== false) fail("Release 0.1 must not claim calibration.");
if (manifest.model_version !== MODEL_VERSION) fail("Release-manifest model version does not match the browser model.");
const generatedCalibration = await read(path.join("src", "data", "generated", "calibration-readiness.json"));
const frozenCalibration = await read(path.join("data", "validation", asOf, "calibration-readiness.json"));
if (sha256(generatedCalibration) !== sha256(frozenCalibration)) fail("Calibration-readiness copies differ.");

const html = (await read("index.html")).toString("utf8");
if (!html.includes("default-src 'self'") || !html.includes('referrer" content="no-referrer')) fail("Static security metadata is missing from index.html.");

const expectedStates = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].sort();
const [contextBytes, generatedContextBytes, policyBytes, generatedPolicyBytes, dataRunBytes, generatedDataRunBytes] = await Promise.all([
  read(path.join(releaseRoot, "state-context.json")), read(path.join("src", "data", "generated", "state-context.json")),
  read(path.join(releaseRoot, "state-policies.json")), read(path.join("src", "data", "generated", "state-policies.json")),
  read(path.join(releaseRoot, "data-run.json")), read(path.join("src", "data", "generated", "data-run.json")),
]);
if (sha256(contextBytes) !== sha256(generatedContextBytes)) fail("State-context public and generated copies differ.");
if (sha256(policyBytes) !== sha256(generatedPolicyBytes)) fail("State-policy public and generated copies differ.");
if (sha256(contextBytes) !== manifest.release_assets.state_context.sha256) fail("State-context hash does not match release-manifest.");
if (sha256(policyBytes) !== manifest.release_assets.state_policies.sha256) fail("State-policy hash does not match release-manifest.");
if (sha256(dataRunBytes) !== sha256(generatedDataRunBytes)) fail("Data-run public and generated copies differ.");
if (sha256(dataRunBytes) !== manifest.release_assets.data_run.sha256) fail("Data-run hash does not match release-manifest.");
const stateContext = JSON.parse(contextBytes.toString("utf8"));
const statePolicies = JSON.parse(policyBytes.toString("utf8"));
const dataRun = JSON.parse(dataRunBytes.toString("utf8"));
if (stateContext.metadata.recordCount !== 50 || statePolicies.metadata.stateCount !== 50) fail("All-state assets must declare exactly 50 states.");
if (JSON.stringify(stateContext.states.map((row) => row.state).sort()) !== JSON.stringify(expectedStates)) fail("State-context set is not the exact 50-state set.");
if (JSON.stringify(statePolicies.coverage.map((row) => row.state).sort()) !== JSON.stringify(expectedStates)) fail("State-policy coverage is not the exact 50-state set.");
if (dataRun.metadata.stateContextRecords !== 50 || dataRun.metadata.statePolicyCoverageRecords !== 50) fail("Data-run ledger does not declare exact all-state coverage.");
if (!dataRun.checks.some((row) => row.id === "openstates-discovery") || !dataRun.checks.some((row) => row.id === "primary-policy-review")) fail("Data-run ledger omits policy discovery or review status.");
for (const row of stateContext.states) {
  if (!(row.electricity.retailSalesTwh > 0) || !(row.electricity.averageCommercialPriceCentsPerKwh > 0)) fail(`${row.state} has invalid EIA units or values.`);
  if (row.electricity.sourceDate !== "2024" || row.water.sourceDate !== "2015") fail(`${row.state} source vintages are invalid.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.drought.sourceDate)) fail(`${row.state} drought date is invalid.`);
  if (!row.sources.every((source) => source.provenance === "Reported" && source.url.startsWith("https://"))) fail(`${row.state} context provenance is incomplete.`);
}
const topology = await parse(path.join("node_modules", "us-atlas", "states-10m.json"));
const geometryNames = new Set(topology.objects.states.geometries.map((geometry) => geometry.properties.name));
if (!geometryNames.has("Alaska") || !geometryNames.has("Hawaii")) fail("Map topology must include Alaska and Hawaii geometry.");

const instruments = new Map(statePolicies.instruments.map((instrument) => [instrument.id, instrument]));
for (const instrument of statePolicies.instruments) {
  if (instrument.reviewStatus === "candidate" && instrument.legalStatus !== "unknown") fail(`${instrument.id} overstates the legal status of a discovery candidate.`);
}
const mechanisms = new Set();
for (const effect of statePolicies.modelEffects) {
  const instrument = instruments.get(effect.policyInstrumentId);
  if (!instrument || !instrument.primarySourceUrl || instrument.reviewStatus !== "reviewed") fail(`${effect.id} lacks a reviewed primary instrument.`);
  if (effect.approvalStatus !== "approved" || !effect.githubApprovalRef || !effect.approvedAt) fail(`${effect.id} lacks reviewed GitHub approval.`);
  if (!effect.primarySourceUrl.startsWith("https://") || !effect.method || !effect.effectiveFrom) fail(`${effect.id} lacks effect provenance.`);
  const mechanismKey = `${effect.state}:${effect.mechanismId}`;
  if (mechanisms.has(mechanismKey)) fail(`${effect.id} duplicates policy mechanism ${mechanismKey}.`);
  mechanisms.add(mechanismKey);
}

const qualified = facilities.filter((facility) => facility.aiClass === "AI-primary" || (facility.aiClass === "AI-significant" && facility.aiConfidence !== "low"));
const operationalShare = (facility) => ["operational", "expanded"].includes(facility.stage) ? 1 : facility.stage === "partially-energized" ? .55 : 0;
const periods = [];
for (let year = 2026; year <= 2030; year += 1) {
  for (let quarter = year === 2026 ? 3 : 1; quarter <= 4; quarter += 1) periods.push({ period: `${year}-Q${quarter}`, elapsed: year - 2026 + (quarter - 3) / 4 });
}
for (let year = 2031; year <= 2040; year += 1) periods.push({ period: String(year), elapsed: year - 2026 });
const knownAt = (facility, elapsed) => {
  const operational = facility.facilityMw.value * operationalShare(facility);
  const adjusted = Math.max(operational, facility.facilityMw.value * facility.completionProbability);
  return elapsed <= 0 ? adjusted : operational + (adjusted - operational) * (1 - Math.exp(-elapsed / 2.4));
};
for (const scenario of scenarios) {
  for (let periodIndex = 0; periodIndex < periods.length; periodIndex += 1) {
    const { period, elapsed } = periods[periodIndex];
    const facilityKnown = qualified.reduce((sum, facility) => sum + knownAt(facility, elapsed), 0);
    const stateKnown = expectedStates.reduce((sum, state) => sum + qualified.filter((facility) => facility.state === state).reduce((stateSum, facility) => stateSum + knownAt(facility, elapsed), 0), 0);
    if (Math.abs(facilityKnown - stateKnown) > 1e-7) fail(`${scenario.id} ${period} facility-to-state reconciliation failed.`);
  }
}

process.stdout.write(`${JSON.stringify({
  asOf,
  checks: {
    exactCuratedFacilitySet: true,
    geographyCopiesHashIdentical: true,
    sensitiveCoordinatesStored: false,
    fullUsEpochTimelineRecords: timeline.metadata.facilityCount,
    rawEpochRecords: rawManifest.record_count,
    calibrationClaimAllowed: calibration.metadata.calibrationClaimAllowed,
    staticSecurityMetadata: true,
    allStateResourceRecords: stateContext.states.length,
    allStatePolicyCoverageRecords: statePolicies.coverage.length,
    alaskaHawaiiGeometry: true,
    releaseAssetHashes: true,
    liveDataRunLedger: true,
    policyApprovalGate: true,
    facilityStateReconciliation: true,
  },
  verifiedAssets: [
    ...verifiedAssets,
    { file: "state-context.json", sha256: sha256(contextBytes), records: stateContext.states.length },
    { file: "state-policies.json", sha256: sha256(policyBytes), records: statePolicies.coverage.length },
    { file: "data-run.json", sha256: sha256(dataRunBytes), records: dataRun.checks.length },
  ],
}, null, 2)}\n`);
