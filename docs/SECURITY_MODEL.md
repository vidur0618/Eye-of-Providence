# Security, privacy, and responsible disclosure

## Release 0.1 boundary

The public application is a static, read-only research release. It has no login, secrets, server-side mutation, user-generated content, database, or model endpoint. Its runtime network policy permits same-origin assets only. External evidence links open in a separate context without a referrer.

The facility notebook can persist optional draft review receipts in the analyst's local browser and export them as JSON. These receipts are SHA-256 chained to help detect accidental edits, but they are unauthenticated, unsigned, untrusted client state. They do not modify the frozen catalogue, change forecasts, or satisfy the production approval role separation described below.

This reduces the attack surface; it does not create the restricted analyst interface described below.

## Location disclosure

- The public map stores and displays city-level points.
- Census address-range coordinates are used transiently to request containing geographies and are discarded.
- County, HUC-8, principal-aquifer-context, provisional control-area, and provisional retail-utility outputs retain provenance, confidence, source vintage, and a disclosure note.
- City-centroid fallbacks are `Imputed`, low confidence, and prohibited from parcel, tract, HUC-12, tax, permitting, or legal-boundary claims.
- Exact government, defense, confidential, or not-clearly-public facility locations must be withheld or aggregated.
- A public street address in an upstream source does not by itself authorize redistributing a precise coordinate.

## Source and document threats

Future ingestion treats every document as untrusted data. Text from websites, PDFs, filings, comments, and news can contain malicious instructions, false citations, source impersonation, or data-poisoning attempts.

The ingestion boundary must:

1. keep document bytes and extracted text outside model/system instructions;
2. identify source host, retrieval path, hash, publication date, access date, and license;
3. scan file type, size, archive members, and malware before extraction;
4. sanitize rendered HTML and never execute document scripts, macros, or embedded links automatically;
5. require primary-document resolution for legal and utility claims;
6. store model-extracted claims as proposals with source spans, not facts;
7. prevent language-model output from altering material forecast parameters;
8. require a named human approval, reason, timestamp, and model release for accepted parameter changes;
9. preserve corrections, retractions, conflicts, and superseding documents;
10. isolate secrets and licensed documents from public exports and model prompts.

## Analyst roles

The production review service requires least-privilege roles:

| Role | Capability |
| --- | --- |
| Viewer | Read public/restricted records allowed by data license |
| Curator | Propose entity merges, classifications, stages, and source links |
| Model reviewer | Propose parameter impacts and execute non-published runs |
| Approver | Accept/reject material data or model changes with a signed reason |
| Release manager | Publish an immutable dataset/model release after gates pass |
| Auditor | Read append-only actions and reproduce releases; cannot edit |

No single automated agent can propose, approve, and publish the same material change.

## Audit and integrity

- Raw snapshots and derived release artifacts receive SHA-256 manifests.
- Historical releases are append-only; `--force` is limited to pre-publication recovery.
- CI validates the frozen package, schemas, reconciliation, accessibility structure, tests, build, dependency compatibility, and known vulnerabilities.
- Production approval events require an append-only log, authenticated actor, before/after values, reason, source IDs, code/model version, and environment manifest.

## Browser policy

The checked-in HTML applies a restrictive same-origin Content Security Policy, disables referrer transmission, and blocks object/embed content. The Vite configuration adds `style-src 'unsafe-inline'` only to the transformed development-server document because Vite injects development CSS through inline style elements; the production build retains the checked-in strict policy. A production host must additionally set HTTP headers for `frame-ancestors`, HSTS, MIME sniffing protection, permissions policy, and cache behavior; meta policy is not a replacement for response headers.

## Incident response

On suspected poisoning, source compromise, disclosure, or model-integrity failure:

1. stop publication and mark the affected release stale;
2. preserve source snapshots, access logs, hashes, and approval history;
3. remove public access only to the affected asset, without rewriting historical manifests;
4. assess whether coordinates, licensed text, or secrets were exposed;
5. publish a correction/retraction record linked to affected releases;
6. rerun validation from the last trusted cutoff before republishing.
