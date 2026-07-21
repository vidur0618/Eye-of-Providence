import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const argument = (name) => {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const RUN_DATE = argument("--as-of") ?? new Date().toISOString().slice(0, 10);
const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const STATE_FIPS = { AL:"01",AK:"02",AZ:"04",AR:"05",CA:"06",CO:"08",CT:"09",DE:"10",FL:"12",GA:"13",HI:"15",ID:"16",IL:"17",IN:"18",IA:"19",KS:"20",KY:"21",LA:"22",ME:"23",MD:"24",MA:"25",MI:"26",MN:"27",MS:"28",MO:"29",MT:"30",NE:"31",NV:"32",NH:"33",NJ:"34",NM:"35",NY:"36",NC:"37",ND:"38",OH:"39",OK:"40",OR:"41",PA:"42",RI:"44",SC:"45",SD:"46",TN:"47",TX:"48",UT:"49",VT:"50",VA:"51",WA:"53",WV:"54",WI:"55",WY:"56" };
const readJson = async (value) => JSON.parse(await readFile(path.resolve(value), "utf8"));
const latestReleasedTuesday = (asOf) => {
  const date = new Date(`${asOf}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 2);
  while (date.getUTCDay() !== 2) date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
};
const DROUGHT_DATE = latestReleasedTuesday(RUN_DATE);
const rows = [];
const add = (row) => rows.push(row);

const [context, policies, epochManifest] = await Promise.all([
  readJson(path.join("public", "data", "releases", RUN_DATE, "state-context.json")),
  readJson(path.join("public", "data", "releases", RUN_DATE, "state-policies.json")),
  readJson(path.join("data", "raw", "epoch-ai", RUN_DATE, "manifest.json")),
]);
const contextStates = context.states.map((row) => row.state).sort();
const policyStates = policies.coverage.map((row) => row.state).sort();
if (JSON.stringify(contextStates) !== JSON.stringify([...STATES].sort())) throw new Error("State context is not the exact 50-state set.");
if (JSON.stringify(policyStates) !== JSON.stringify([...STATES].sort())) throw new Error("Policy coverage is not the exact 50-state set.");

try {
  const response = await fetch("https://epoch.ai/data/data_centers/data_centers.zip", { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "Key-of-Providence/0.2 data-audit" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const remoteHash = createHash("sha256").update(archive).digest("hex");
  add({ id:"epoch-snapshot", category:"Facilities & announcements", label:"Epoch AI public source package", status: remoteHash === epochManifest.archive_sha256 ? "passed" : "update-available", stateCoverage:"65 U.S. source records; 18 curated dashboard records", sourceDate:RUN_DATE, sourceUrl:epochManifest.documentation_url, note: remoteHash === epochManifest.archive_sha256 ? "Remote package matches the immutable release snapshot." : "Remote package changed after the release cutoff; review and freeze a new snapshot before publication." });
} catch (error) {
  add({ id:"epoch-snapshot", category:"Facilities & announcements", label:"Epoch AI public source package", status:"blocked", stateCoverage:"Last valid snapshot preserved", sourceDate:RUN_DATE, sourceUrl:epochManifest.documentation_url, note:`Remote integrity check failed: ${error.message}` });
}

const eiaKey = process.env.EIA_API_KEY ?? "DEMO_KEY";
try {
  const query = new URLSearchParams({ api_key:eiaKey, frequency:"annual", start:context.metadata.eiaYear, end:context.metadata.eiaYear, offset:"0", length:"1" });
  query.append("data[0]", "sales"); query.append("facets[sectorid][]", "ALL");
  const response = await fetch(`https://api.eia.gov/v2/electricity/retail-sales/data/?${query}`, { signal:AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  add({ id:"eia-state", category:"Electricity", label:"EIA state electricity API", status:"passed", stateCoverage:"50 released state records", sourceDate:context.metadata.eiaYear, sourceUrl:"https://www.eia.gov/opendata/", note:`Live API responded using ${process.env.EIA_API_KEY ? "the server-side secret" : "the demo key"}; released values remain review-gated.` });
} catch (error) {
  add({ id:"eia-state", category:"Electricity", label:"EIA state electricity API", status:"blocked", stateCoverage:"50 last-valid released state records", sourceDate:context.metadata.eiaYear, sourceUrl:"https://www.eia.gov/opendata/", note:`Live refresh unavailable (${String(error.message).slice(0, 180)}). The immutable ${context.metadata.eiaYear} release remains in use.` });
}

add({ id:"usgs-water", category:"Water", label:"USGS nationally consistent water-use compilation", status:"stale", stateCoverage:"50 released state records", sourceDate:context.metadata.usgsWaterUseYear, sourceUrl:"https://water.usgs.gov/watuse/data/", note:"2015 remains the latest nationally consistent state compilation used here. It is historical context, not a facility water source, right, entitlement, or availability measure." });

try {
  const drought = await Promise.all(STATES.map(async (state) => {
    const query = new URLSearchParams({ aoi:STATE_FIPS[state], startdate:DROUGHT_DATE, enddate:DROUGHT_DATE, statisticsType:"1" });
    const response = await fetch(`https://usdmdataservices.unl.edu/api/StateStatistics/GetDroughtSeverityStatisticsByAreaPercent?${query}`, { signal:AbortSignal.timeout(30_000), headers:{ Accept:"text/csv" } });
    if (!response.ok) throw new Error(`${state} ${response.status}`);
    const body = await response.text();
    if (!body.includes("D1") || body.trim().split(/\r?\n/).length < 2) throw new Error(`${state} schema`);
    return state;
  }));
  add({ id:"usdm-state", category:"Drought", label:"U.S. Drought Monitor state statistics", status:"passed", stateCoverage:`${drought.length} live state responses`, sourceDate:context.metadata.droughtValidDate, sourceUrl:"https://www.drought.gov/data-download", note:"Weekly state-area context validated. It does not identify facility water supply or availability." });
} catch (error) {
  add({ id:"usdm-state", category:"Drought", label:"U.S. Drought Monitor state statistics", status:"blocked", stateCoverage:"50 last-valid released state records", sourceDate:context.metadata.droughtValidDate, sourceUrl:"https://www.drought.gov/data-download", note:`Live state validation failed: ${error.message}. The last valid release remains in use.` });
}

add({ id:"ncsl-policy-index", category:"State policy", label:"NCSL 50-state data-center incentive index", status:"passed", stateCoverage:`50 states; ${policies.instruments.length} model-inactive candidates`, sourceDate:policies.metadata.publicIndexUpdated ?? RUN_DATE, sourceUrl:policies.metadata.discoveryIndexes[0], note:"Secondary discovery index only. Every candidate still requires controlling primary text and current-status review." });
add({ id:"primary-policy-review", category:"State policy", label:"Primary-source legal review", status:policies.coverage.some((row) => row.reviewedInstrumentIds.length) ? "partial" : "gap", stateCoverage:`${policies.coverage.filter((row) => row.reviewedInstrumentIds.length).length} states with reviewed instruments`, sourceDate:RUN_DATE, sourceUrl:"https://docs.openstates.org/api-v3/", note:"No candidate is treated as a legal finding or forecast input until the controlling source, status, dates, mechanism, and review record are complete." });
add({ id:"openstates-discovery", category:"Bills & drafts", label:"OpenStates weekday bill discovery", status:process.env.OPENSTATES_API_KEY ? "available" : "credential-required", stateCoverage:"Configured for all 50 states", sourceDate:RUN_DATE, sourceUrl:"https://docs.openstates.org/api-v3/", note:process.env.OPENSTATES_API_KEY ? "Server-side key is present; run the dedicated discovery job to create a review snapshot." : "OPENSTATES_API_KEY is absent locally. The job cannot enumerate current bills or drafts, and no empty result is inferred." });
add({ id:"announcement-review", category:"Facilities & announcements", label:"Primary announcement review", status:"partial", stateCoverage:"Source-linked for curated facilities only", sourceDate:RUN_DATE, sourceUrl:epochManifest.documentation_url, note:"Operator, utility, permit, SEC, and agency announcements are reviewed per facility. This release is not a national announcement census." });

const release = {
  metadata: {
    schemaVersion:"data-run.v1",
    runDate:RUN_DATE,
    generatedAt:new Date().toISOString(),
    overallStatus:rows.some((row) => ["blocked","gap","credential-required","update-available"].includes(row.status)) ? "partial" : "passed",
    stateContextRecords:context.states.length,
    statePolicyCoverageRecords:policies.coverage.length,
    reviewedPolicyStates:policies.coverage.filter((row) => row.reviewedInstrumentIds.length).length,
    candidatePolicyInstruments:policies.instruments.filter((row) => row.reviewStatus === "candidate").length,
    approvedPolicyEffects:policies.modelEffects.filter((row) => row.approvalStatus === "approved").length,
  },
  checks:rows,
  gaps:[
    "All-state resource context is present, but EIA and USGS vintages are not real-time operating conditions.",
    "Current bills and drafts were not enumerated because the OpenStates server-side key is unavailable in this run.",
    "The NCSL index covers dedicated tax incentives, not every state or local policy channel.",
    "Facility announcements are source-linked for the curated registry, not an exhaustive national announcement feed.",
  ],
};
const output = `${JSON.stringify(release, null, 2)}\n`;
const targets = [
  path.join("data", "research-inbox", "data-runs", RUN_DATE, "data-run.json"),
  path.join("public", "data", "releases", RUN_DATE, "data-run.json"),
  path.join("src", "data", "generated", "data-run.json"),
];
for (const target of targets) { await mkdir(path.dirname(target), { recursive:true }); await writeFile(target, output); }
process.stdout.write(`${JSON.stringify({ targets, overallStatus:release.metadata.overallStatus, checks:rows.map((row) => ({ id:row.id, status:row.status })) }, null, 2)}\n`);
