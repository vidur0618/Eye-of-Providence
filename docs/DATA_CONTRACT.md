# Data contract

Key of Providence treats provenance as part of the value, not as a footnote.

## Stable entity hierarchy

The release implements stable `FacilityRecord` identifiers and keeps these concepts separate:

- operator and named users;
- campus/facility and wider project;
- current project phase and ultimate project ambition;
- facility power and IT power;
- evidence for AI classification and evidence for construction status;
- source documents and transparent calculation sheets.

The production hierarchy will extend this record into operator, owner, developer, customer, campus, parcel, building, development phase, utility service, interconnection request, permit, hardware deployment, and source-document tables. IDs must survive ownership and display-name changes. Merges and splits require an append-only crosswalk.

## Quantitative field envelope

Every measurement must resolve the following metadata directly or through a versioned dataset manifest:

| Field | Required meaning |
| --- | --- |
| `value` | Numeric value before display rounding |
| `unit` | UCUM-compatible or documented domain unit |
| `definition` | What the number measures and excludes |
| `provenance` | Observed, Reported, Verified derived, Estimated, Imputed, Forecast, or Scenario output |
| `sourceId` | Stable source-registry reference |
| `sourcePublicationDate` | Date attached to the source artifact |
| `accessDate` | When this release retrieved or reviewed it |
| `method` | Transformation, estimation, or imputation method |
| `uncertaintyPct` | Release parameter, not a claim of calibrated coverage unless explicitly validated |
| `datasetVersion` | Immutable input snapshot identifier |

No transform may silently change provenance class. A derived field must carry the input versions and equation. A correction creates a new release; it does not overwrite an old manifest.

## Power definitions

- **Facility MW** includes IT equipment and facility overhead.
- **IT MW** excludes cooling and other facility overhead; release 0.2 derives it as `facility MW / PUE`.
- **Operational MW** counts only the operating share of a phase.
- **Probability-adjusted MW** is `sum(phase facility MW × completion probability)`.
- **Annual TWh** is `facility MW × load factor × 8,760 / 1,000,000`.
- **Apparent supply MVA** is a screening calculation `facility MW / 0.95 assumed power factor`; it is not transformer count, voltage, topology, firm service, or an interconnection entitlement.

Land is stored only as source-reported parcel or campus acres with boundary and inclusion semantics. Unknown acreage remains unknown. A generic MW-to-acre conversion is prohibited because cooling, on-site generation, substations, setbacks, security, parking, and multi-phase site control differ materially.

Announced ultimate capacity, utility-requested load, utility-approved load, connected load, peak load, and annual energy are different fields even when a source calls each of them “capacity.”

## AI classification

Cloud ownership alone is insufficient. `AI-primary`, `AI-significant`, `mixed`, `general-or-unknown`, and `government-or-defense` require retained evidence and confidence. Training and inference orientation are future orthogonal dimensions, not replacements for the evidence class.

## Location disclosure

Release 0.2 renders city-level display points. Exact coordinates may be retained only when already clearly public, necessary for analysis, licensed for reuse, and approved for disclosure. Government/defense or otherwise sensitive locations must be aggregated or withheld.

Release-generation jobs may use a Census address-range coordinate transiently for polygon containment. Public artifacts retain only the containing county, HUC-8, regional principal-aquifer context, provisional control-area candidates, or provisional retail-utility candidates plus method, confidence, version, and disclosure. The coordinate and matched address are discarded. County/HUC/aquifer containment does not establish a parcel, permit, water supply, well, withdrawal, water right, or use. Control-area and retail-territory polygons do not establish the serving utility, tariff, contract, interconnection, or current balancing authority and are not forecast-eligible until confirmed from primary electrical evidence.

## State context and policy contracts

`StateResourceContext` stores one record for each of the 50 states. EIA retail sales, commercial price, and generation mix; USGS 2015 freshwater withdrawals; and weekly U.S. Drought Monitor area are `Reported` context. Each retains its source date, freshness status, provenance, and a non-inference limitation. These fields never become causal forecast inputs merely because they are displayed beside a forecast.

`FacilityForecastPeriod` contains known-project capacity only. `StateForecastPeriod` adds the separate state-level unannounced-growth channel. A state with no qualifying facilities uses `coverage: no-tracked-records`; consumers must render that status as missing coverage rather than numeric zero.

`PolicyInstrument` separates legal status, review status, effective dates, primary text, discovery source, topic, and mechanism identifier. `PolicyModelEffect` is eligible only when the instrument is reviewed and enacted/effective, the selected period is inside the effective window, a quantitative low/central/high factor and method exist, and a reviewed GitHub approval reference is present. Mechanism identifiers are unique within a state so a law, tariff, and implementation order cannot double-count one causal mechanism.
