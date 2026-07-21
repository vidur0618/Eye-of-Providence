import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const RELEASE_DATE = "2026-07-21";
const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const priorityStates = new Set(["AZ", "GA", "IA", "IN", "MN", "MS", "NE", "OH", "TN", "TX", "VA", "WI"]);
const indexPath = path.join("data", "research-inbox", "policy", RELEASE_DATE, "ncsl-incentive-index.json");
const indexRelease = JSON.parse(await readFile(indexPath, "utf8"));
if (indexRelease.metadata.stateCount !== 50) throw new Error("The NCSL discovery index must cover the exact 50-state set.");
const indexByState = new Map(indexRelease.states.map((row) => [row.state, row]));
const candidates = indexRelease.states
  .filter((row) => row.indexFinding === "dedicated-incentive-indexed")
  .map((row) => ({
    id: `ncsl-tax-incentive-${row.state.toLowerCase()}`,
    mechanismId: `ncsl-tax-incentive:${row.state}`,
    state: row.state,
    title: `${row.stateName} data-center tax incentive — discovery candidate`,
    documentType: "Secondary index entry",
    legalStatus: "unknown",
    effectiveFrom: null,
    effectiveTo: null,
    primarySourceUrl: row.primarySourceCandidateUrl,
    discoverySourceUrl: indexRelease.metadata.source,
    topics: ["data centers", "tax incentive"],
    reviewStatus: "candidate",
    reviewedAt: null,
    summary: `${row.summary} ${row.reviewNote}`,
  }));
const candidatesByState = new Map(STATES.map((state) => [state, candidates.filter((candidate) => candidate.state === state)]));

const release = {
  metadata: {
    schemaVersion: "state-policies.v1",
    releaseDate: RELEASE_DATE,
    stateCount: 50,
    instrumentCount: candidates.length,
    modelEffectCount: 0,
    discoverySource: "https://docs.openstates.org/api-v3/",
    discoveryIndexes: [
      "https://www.ncsl.org/fiscal/subsidizing-servers-how-states-are-competing-to-attract-data-centers",
      "https://www.ncsl.org/energy/ncsl-2025-state-legislative-energy-trends-report"
    ],
    publicIndexUpdated: indexRelease.metadata.sourceUpdatedLabel,
    analyticalStatus: "The release exposes a 50-state secondary discovery index. Candidates are not legal findings and no state policy effect is approved.",
  },
  coverage: STATES.map((state) => {
    if (!indexByState.has(state)) throw new Error(`The discovery index is missing ${state}.`);
    const stateCandidates = candidatesByState.get(state) ?? [];
    return {
      state,
      coverageStatus: "discovery-pending",
      reviewedInstrumentIds: [],
      candidateInstrumentIds: stateCandidates.map((candidate) => candidate.id),
      lastReviewed: null,
      freshness: "current",
      note: stateCandidates.length
        ? `${priorityStates.has(state) ? "Priority facility state. " : ""}NCSL's ${indexRelease.metadata.sourceUpdatedLabel ?? "current"} secondary index flags a dedicated incentive; controlling text and current legal status still require primary-source review.`
        : `NCSL's secondary index reports no dedicated state incentive. This is not a primary legal finding and does not cover bills, tariffs, dockets, local law, agency decisions, or announcements.`,
    };
  }),
  instruments: candidates,
  modelEffects: [],
};

const output = `${JSON.stringify(release, null, 2)}\n`;
const targets = [
  path.join("public", "data", "releases", RELEASE_DATE, "state-policies.json"),
  path.join("src", "data", "generated", "state-policies.json"),
];
for (const target of targets) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, output);
}
process.stdout.write(`${JSON.stringify({ states: release.coverage.length, sha256: createHash("sha256").update(output).digest("hex"), targets }, null, 2)}\n`);
