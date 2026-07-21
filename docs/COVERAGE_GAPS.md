# Coverage gaps and non-inference rules

Release 0.2 makes missing relationships visible instead of filling them with state-level or proximity-based guesses. “Candidate” below means a lead for primary-source review, not a fact and not a forecast input.

| Relationship or measure | Release 0.1 status | Why the current evidence is insufficient | Evidence required to resolve it |
| --- | --- | --- | --- |
| Serving electric utility | Provisional HIFLD polygon candidates for all 18 records; 11 records have multiple candidates | Retail territories overlap and may omit special large-load arrangements | Utility or commission record, executed/summarized service agreement, tariff/service class, effective date, and interconnection evidence |
| Balancing authority | Provisional legacy control-area candidates; 2 records have multiple candidates | A polygon is not electrical topology, and the national snapshot is dated 2021 | Confirmed serving utility plus current topology/BA documentation and effective date |
| ISO/RTO or non-RTO status | Adapter planned | State membership and BA-name inference fail near seams, embedded utilities, and non-RTO regions | Confirmed utility/BA relationship plus operator membership and zone effective dates |
| Water utility | Coverage gap | There is no single comprehensive national public service-territory source suitable for large-load contracts | Provider confirmation, service agreement, potable/reclaimed mix, capacity commitment, restrictions, rate class, and effective date |
| Groundwater supply / aquifer used | Unknown | The 2003 USGS polygon is regional surface context only | Documented source mix, well or provider evidence, permit/right where applicable, aquifer code, and effective period |
| HUC-12 | Withheld | Ten of 18 records use city-centroid locators and the remainder use calculated address-range coordinates | Approved site/parcel geometry with disclosure review and a release-pinned HUC-12 overlay |
| Campus/parcel acreage | 0 of 18 source-backed values | DOE guidance says land need varies from a few acres to hundreds with design and included infrastructure | Parcel/campus boundary, source-reported acres, inclusion rule, date, and phase relationship |
| Transformer units and topology | Not modeled | Facility MW alone does not determine voltage, unit size, redundancy, or ownership | Interconnection study/design, one-line diagram or equivalent, transformer ratings, redundancy rule, status, and delivery dates |
| Calibrated completion probability and intervals | Blocked | One current source cutoff and no independent subsequent-outcome release cannot support hindcasting | At least three independently frozen cutoffs, leakage-reviewed outcomes, and a reviewed scorecard with the repository's implemented metrics |
| Authenticated analyst approval | Not available in the static release | Browser receipts are local, unsigned, and unauthenticated | Identity provider, least-privilege roles, two-person material-impact approval, append-only audit storage, and release-manager signature |
| State policy primary review | 38 NCSL incentive candidates; 0 reviewed state instruments; 0 approved effects | The NCSL table is a secondary index and the OpenStates run was blocked without its server-side key | Controlling legislature, commission, agency, tariff, or docket text; current legal status; dates; mechanism deduplication; reviewer and approval reference |
| Bills, drafts, and policy announcements | Discovery job configured for all 50 states but not completed in the July 21 local run | `OPENSTATES_API_KEY` was unavailable; an empty result would be misleading | Credentialed immutable discovery snapshot plus official primary links and human review |
| Facility/project announcements | Source-linked for the curated Epoch registry only | Company newsrooms, permits, utility filings, SEC filings, and local approvals do not form one exhaustive national feed | Deduplicated event registry with entity resolution, supersession rules, primary links, access dates, and review state |

## Non-inference policy

- Do not assign utility, BA, ISO/RTO, water provider, aquifer used, tariff, or service entitlement from state alone.
- Preserve every polygon overlap and an unresolved state; do not select the most familiar provider.
- Do not treat “no record” as zero infrastructure, zero water use, zero acreage, or no provider.
- Do not convert principal-aquifer containment into a groundwater-use claim.
- Do not convert apparent MVA into transformer count or firm service.
- Do not label sensitivity bands calibrated until the executable readiness gate and a reviewed hindcast scorecard pass.
