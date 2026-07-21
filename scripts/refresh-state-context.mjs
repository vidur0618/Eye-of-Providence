import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse } from "csv-parse/sync";

const argument = (name) => {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const RELEASE_DATE = argument("--as-of") ?? new Date().toISOString().slice(0, 10);
const EIA_YEAR = "2024";
const latestReleasedTuesday = (asOf) => {
  const date = new Date(`${asOf}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 2);
  while (date.getUTCDay() !== 2) date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
};
const DROUGHT_DATE = latestReleasedTuesday(RELEASE_DATE);
const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming",
};
const STATE_FIPS = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10",
  FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20",
  KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28",
  MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36",
  NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45",
  SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54",
  WI: "55", WY: "56",
};
const states = Object.keys(STATE_NAMES);
const allowDemo = process.argv.includes("--allow-demo");
const reviewSnapshot = process.argv.includes("--review-snapshot");
const eiaKey = process.env.EIA_API_KEY || (allowDemo ? "DEMO_KEY" : null);
if (!eiaKey) throw new Error("EIA_API_KEY is required. Use --allow-demo only for a manual seed refresh.");

const fetchText = async (url, headers) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
};
const eia = async (route, params) => {
  const query = new URLSearchParams({ api_key: eiaKey, frequency: "annual", start: EIA_YEAR, end: EIA_YEAR, offset: "0", length: "5000" });
  params.data.forEach((value, index) => query.append(`data[${index}]`, value));
  Object.entries(params.facets).forEach(([facet, values]) => values.forEach((value) => query.append(`facets[${facet}][]`, value)));
  const response = await fetch(`https://api.eia.gov/v2/${route}/data/?${query}`);
  if (!response.ok) throw new Error(`EIA ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  return payload.response.data;
};

const [retailRows, generationRows, usgsText] = await Promise.all([
  eia("electricity/retail-sales", { data: ["sales", "price"], facets: { sectorid: ["ALL", "COM"] } }),
  eia("electricity/electric-power-operational-data", { data: ["generation"], facets: { sectorid: ["99"], fueltypeid: ["ALL", "FOS", "AOR", "NUC"] } }),
  fetchText("https://www.sciencebase.gov/catalog/file/get/5af3311be4b0da30c1b245d8?f=__disk__eb%2F74%2Feb%2Feb74ebb41169c76aaf374990bd5a71cac82604c1"),
]);

const usgsStart = usgsText.indexOf("STATE,STATEFIPS");
if (usgsStart < 0) throw new Error("USGS schema changed: header not found.");
const usgsRows = parse(usgsText.slice(usgsStart), { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true });
const waterByState = new Map(states.map((state) => [state, 0]));
for (const row of usgsRows) {
  if (!waterByState.has(row.STATE)) continue;
  const value = Number(row["TO-WFrTo"]);
  if (Number.isFinite(value)) waterByState.set(row.STATE, (waterByState.get(row.STATE) ?? 0) + value);
}

const droughtRows = await Promise.all(states.map(async (state) => {
  const query = new URLSearchParams({ aoi: STATE_FIPS[state], startdate: DROUGHT_DATE, enddate: DROUGHT_DATE, statisticsType: "1" });
  const text = await fetchText(`https://usdmdataservices.unl.edu/api/StateStatistics/GetDroughtSeverityStatisticsByAreaPercent?${query}`, { Accept: "text/csv" });
  const [row] = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  if (!row) throw new Error(`No drought row returned for ${state}.`);
  return [state, row];
}));
const droughtByState = new Map(droughtRows);

const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const round = (value, digits = 2) => value == null ? null : Number(value.toFixed(digits));
const retail = new Map(retailRows.map((row) => [`${row.stateid ?? row.location}:${row.sectorid}`, row]));
const generation = new Map(generationRows.map((row) => [`${row.location ?? row.stateid}:${row.fueltypeid}`, numeric(row.generation)]));

const records = states.map((state) => {
  const allRetail = retail.get(`${state}:ALL`);
  const commercialRetail = retail.get(`${state}:COM`);
  const totalGeneration = generation.get(`${state}:ALL`) ?? null;
  const fossil = generation.get(`${state}:FOS`) ?? 0;
  const renewable = generation.get(`${state}:AOR`) ?? 0;
  const nuclear = generation.get(`${state}:NUC`) ?? 0;
  const share = (value) => totalGeneration && totalGeneration > 0 ? round((value / totalGeneration) * 100, 1) : null;
  const accounted = fossil + renewable + nuclear;
  const drought = droughtByState.get(state);
  return {
    state,
    stateName: STATE_NAMES[state],
    electricity: {
      retailSalesTwh: round(numeric(allRetail?.sales) == null ? null : numeric(allRetail.sales) / 1000, 2),
      averageCommercialPriceCentsPerKwh: round(numeric(commercialRetail?.price), 2),
      generationMixPct: {
        fossil: share(fossil),
        renewable: share(renewable),
        nuclear: share(nuclear),
        other: totalGeneration && totalGeneration > 0 ? round((Math.max(0, totalGeneration - accounted) / totalGeneration) * 100, 1) : null,
      },
      sourceDate: EIA_YEAR,
      freshness: "aging",
    },
    water: {
      freshwaterWithdrawalsMgd: round(waterByState.get(state) ?? null, 2),
      sourceDate: "2015",
      freshness: "stale",
      limitation: "Historical statewide freshwater withdrawals; not a data-center water source, right, provider, entitlement, or availability measure.",
    },
    drought: {
      d1D4Pct: round(numeric(drought.D1), 2),
      d2D4Pct: round(numeric(drought.D2), 2),
      d3D4Pct: round(numeric(drought.D3), 2),
      d4Pct: round(numeric(drought.D4), 2),
      sourceDate: String(drought.ValidStart),
      freshness: "current",
      limitation: "Broad-scale weekly drought area; not evidence of a facility provider, source, water right, or physical availability.",
    },
    sources: [
      { id: "eia-state-electricity-2024", label: "EIA state electricity data", url: "https://www.eia.gov/opendata/", accessedAt: RELEASE_DATE, provenance: "Reported" },
      { id: "usgs-water-use-2015", label: "USGS 2015 water-use compilation", url: "https://doi.org/10.5066/F7TB15V5", accessedAt: RELEASE_DATE, provenance: "Reported" },
      { id: "usdm-state-area-2026-07-14", label: "U.S. Drought Monitor state statistics", url: "https://droughtmonitor.unl.edu/DmData/DataDownload/WebServiceInfo.aspx", accessedAt: RELEASE_DATE, provenance: "Reported" },
    ],
  };
});

const incomplete = records.filter((row) => !row.electricity.retailSalesTwh || row.water.freshwaterWithdrawalsMgd == null || row.drought.d1D4Pct == null);
if (records.length !== 50 || incomplete.length > 0) {
  throw new Error(`State context validation failed: ${incomplete.map((row) => row.state).join(", ") || `record count ${records.length}`}.`);
}

const release = {
  metadata: {
    schemaVersion: "state-context.v1",
    releaseDate: RELEASE_DATE,
    recordCount: records.length,
    eiaYear: EIA_YEAR,
    usgsWaterUseYear: "2015",
    droughtValidDate: records[0].drought.sourceDate,
    analyticalStatus: "Reported state context only; excluded from forecast causal inputs.",
  },
  states: records,
};
const output = `${JSON.stringify(release, null, 2)}\n`;
const targets = reviewSnapshot
  ? [path.join("data", "research-inbox", "state-context", RELEASE_DATE, "state-context.json")]
  : [path.join("public", "data", "releases", RELEASE_DATE, "state-context.json"), path.join("src", "data", "generated", "state-context.json")];
for (const target of targets) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, output);
}
process.stdout.write(`${JSON.stringify({ records: records.length, sha256: createHash("sha256").update(output).digest("hex"), targets }, null, 2)}\n`);
