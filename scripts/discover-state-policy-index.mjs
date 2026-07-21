import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const RELEASE_DATE = process.argv.find((value) => value.startsWith("--as-of="))?.split("=")[1]
  ?? process.argv[process.argv.indexOf("--as-of") + 1]
  ?? new Date().toISOString().slice(0, 10);
const SOURCE_URL = "https://www.ncsl.org/fiscal/subsidizing-servers-how-states-are-competing-to-attract-data-centers";
const STATE_CODES = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

const decode = (value) => value
  .replaceAll("&nbsp;", " ")
  .replaceAll("&sect;", "§")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&hellip;", "…")
  .replaceAll("&ndash;", "–")
  .replaceAll("&mdash;", "—")
  .replaceAll("&ldquo;", '“')
  .replaceAll("&rdquo;", '”')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
const text = (value) => decode(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const response = await fetch(SOURCE_URL, { headers: { "user-agent": "Key-of-Providence/0.2 policy-discovery" } });
if (!response.ok) throw new Error(`NCSL discovery index failed: ${response.status} ${response.statusText}`);
const html = await response.text();
const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0];
if (!table) throw new Error("NCSL discovery schema changed: incentive table not found.");

const rows = [];
for (const rowHtml of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
  const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => text(match[1]));
  const stateName = cells[0];
  const state = STATE_CODES[stateName];
  if (!state) continue;
  const href = rowHtml.match(/href=["']([^"']+)["']/i)?.[1]?.replace(/^http:\/\//, "https://") ?? null;
  const joined = cells.slice(1).filter(Boolean).join(" · ");
  const hasDedicatedIncentive = !/^No incentive\b/i.test(cells[1] ?? "") && /\bYes\b|exempt|abatement|refund|reduced|tax credit/i.test(joined);
  rows.push({
    state,
    stateName,
    indexFinding: hasDedicatedIncentive ? "dedicated-incentive-indexed" : "no-dedicated-incentive-indexed",
    summary: joined || "No detail supplied in the secondary index.",
    citationLabel: text(rowHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "") || null,
    primarySourceCandidateUrl: href ? decode(href) : null,
    reviewStatus: "candidate",
    modelEligible: false,
    reviewNote: "Secondary discovery only. Verify the official text, current legal status, dates, implementation, and mechanism before publication as reviewed evidence.",
  });
}

const foundStates = new Set(rows.map((row) => row.state));
const missing = Object.values(STATE_CODES).filter((state) => !foundStates.has(state));
if (rows.length !== 50 || missing.length) throw new Error(`NCSL index did not yield the exact 50 states: ${missing.join(", ") || rows.length}`);

const updatedLabel = text(html).match(/Updated\s+([A-Z][a-z]+\s+\d{2},\s+\d{4})/)?.[1] ?? null;
const release = {
  metadata: {
    schemaVersion: "policy-discovery-index.v1",
    createdAt: new Date().toISOString(),
    accessedAt: RELEASE_DATE,
    source: SOURCE_URL,
    sourceUpdatedLabel: updatedLabel,
    stateCount: rows.length,
    candidateCount: rows.filter((row) => row.indexFinding === "dedicated-incentive-indexed").length,
    publicationStatus: "review-only secondary discovery",
    limitation: "This index covers dedicated state tax incentives, not every bill, tariff, docket, local action, agency decision, or project announcement.",
  },
  states: rows,
};
const target = path.join("data", "research-inbox", "policy", RELEASE_DATE, "ncsl-incentive-index.json");
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(release, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ target, states: rows.length, candidates: release.metadata.candidateCount, updated: updatedLabel }, null, 2)}\n`);
