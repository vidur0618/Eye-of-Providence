# How Codex and GPT-5.6 were used

## Summary

Key of Providence was built with **OpenAI Codex powered by GPT-5.6** as a development partner. Codex accelerated implementation across the interface, deterministic model, data-release tooling, tests, audits, visual QA, and documentation.

It was not used as a hidden decision-maker inside the released product. The public application has no LLM endpoint or runtime model call: its calculations run from versioned TypeScript code and frozen data artifacts.

## What Codex contributed

### Product and research architecture

Codex helped turn the initial concept into a concrete research-product architecture:

- a static-first React application that can run locally or on free static hosting;
- a data contract that makes provenance, unit, definition, source, date, method, uncertainty, and version part of every analytical value;
- a model card and calibration gate that prevent sensitivity bands from being presented as validated prediction intervals;
- a security and privacy model for city-level disclosure, untrusted-source handling, and future analyst approval workflows.

### Application implementation

Codex accelerated implementation and iteration of:

- the synchronized 50-state map, forecast controls, state/facility drill-down, scenario engine, source ledger, policy workbench, and accessible data table;
- deterministic TypeScript calculations for operational, catalogued, and probability-adjusted capacity;
- resource conversions for IT power, annual electricity, direct cooling water, and apparent supply screening;
- URL-synchronized state, CSV exports, citation copy, reduced-motion support, and responsive layouts.

### Data and release engineering

Codex helped create and refine the scripts and checks that make the release inspectable:

- immutable Epoch AI snapshot ingestion and SHA-256 manifests;
- derived facility and state artifacts;
- county, watershed, aquifer, balancing-authority, and retail-territory crosswalks with explicit confidence and non-inference rules;
- source-health auditing that reports passed, stale, blocked, credential-required, partial, and update-available conditions;
- release auditing, reconciliation checks, and calibration-readiness metrics.

### Quality assurance and documentation

Codex assisted with:

- test coverage for domain calculations, provenance, validation, state research, catalog data, and review receipts;
- linting, TypeScript production builds, release checks, and accessibility testing;
- browser-based review of desktop and narrow layouts, interaction state, and console behavior;
- the README, model card, data contract, security model, coverage-gap register, audit report, and Devpost submission materials.

## Human decisions and safeguards

The project team retained responsibility for all product, research, and publication decisions. Key human-directed choices included:

1. **No fabricated relationships.** A facility's location inside a polygon does not prove its serving utility, balancing authority, water source, tariff, or interconnection.
2. **Visible uncertainty.** Sensitivity envelopes remain labelled as sensitivity envelopes until historical hindcasting supports a calibrated claim.
3. **Provenance is a product feature.** “Observed,” “Reported,” “Estimated,” “Imputed,” “Forecast,” and “Scenario output” remain distinct in the interface and data model.
4. **Policy discovery is not policy effect.** Candidate policy records cannot change a forecast without primary-source review, a documented method, and approval.
5. **Privacy-aware publication.** The public map uses city-level display points and withholds precise location claims that have not passed disclosure review.
6. **Deterministic runtime.** GPT-5.6 helped build and review the software; it does not generate the published numbers at runtime.

These choices were encoded in types, tests, manifests, release gates, and interface copy so they can be reviewed and reproduced.

## Evidence in the repository

| Area | Where to inspect |
| --- | --- |
| Deterministic forecasting and equations | src/domain/model.ts |
| Data and provenance contract | docs/DATA_CONTRACT.md |
| Intended use, limitations, and calibration gate | docs/MODEL_CARD.md |
| Privacy, security, and review roles | docs/SECURITY_MODEL.md |
| Explicit coverage gaps and non-inference policy | docs/COVERAGE_GAPS.md |
| Release and source audit | docs/AUDIT_2026-07-21.md |
| Automated checks | src tests, scripts, and GitHub workflows |

## Reproducibility boundary

The documented release is reproducible from the checked-in source, frozen data artifacts, and the repository's verification commands. The project does not claim that Codex output itself is a source of truth; all published values remain traceable to versioned inputs, deterministic transforms, and cited evidence.

For the Devpost submission, the team should provide the /feedback session ID from the Codex task in which the majority of the core functionality was built. This repository document explains the workflow but does not invent or substitute that session ID.
