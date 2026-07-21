import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const key = process.env.OPENSTATES_API_KEY;
if (!key) throw new Error("OPENSTATES_API_KEY is required and must remain server-side.");
const asOf = new Date().toISOString().slice(0, 10);
const jurisdictions = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];
const queryTerms = ["data center", "large load", "electric utility", "water use"];
const candidates = [];

for (const jurisdiction of jurisdictions) {
  for (const term of queryTerms) {
    const query = new URLSearchParams({ jurisdiction, q: term, per_page: "20", sort: "updated_desc" });
    const response = await fetch(`https://v3.openstates.org/bills?${query}`, { headers: { "X-API-KEY": key } });
    if (!response.ok) throw new Error(`OpenStates ${response.status} for ${jurisdiction}/${term}: ${await response.text()}`);
    const payload = await response.json();
    for (const bill of payload.results ?? []) {
      const id = bill.id ?? `${jurisdiction}:${bill.session}:${bill.identifier}`;
      if (candidates.some((candidate) => candidate.openstatesId === id)) continue;
      candidates.push({
        status: "Candidate",
        openstatesId: id,
        jurisdiction,
        session: bill.session,
        identifier: bill.identifier,
        title: bill.title,
        latestActionDate: bill.latest_action_date ?? null,
        latestActionDescription: bill.latest_action_description ?? null,
        openstatesUrl: bill.openstates_url ?? null,
        discoveryTerm: term,
        primarySourceUrl: null,
        modelEligible: false,
        reviewNote: "Discovery only. Link and review an official legislature, commission, or agency document before changing status.",
      });
    }
  }
}

const snapshot = {
  metadata: { schemaVersion: "policy-discovery.v1", createdAt: new Date().toISOString(), source: "https://docs.openstates.org/api-v3/", candidateCount: candidates.length, publicationStatus: "review-only" },
  candidates,
};
const target = path.join("data", "research-inbox", "policy", asOf, "openstates-candidates.json");
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ target, candidates: candidates.length }, null, 2)}\n`);
