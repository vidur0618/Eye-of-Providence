# Forecast model card — `kop-forecast-0.2.0`

## Intended use

This model demonstrates how source-linked known projects, explicit completion weights, resource conversions, constraints, scenarios, and uncertainty can coexist in one reproducible public interface. It supports research exploration and design validation. It is not yet suitable for utility planning, investment decisions, legal compliance, or claims of predictive accuracy.

## Inputs

- Curated public interface subset backed by the complete U.S. portion of Epoch AI's CC BY AI Data Centers release and its dated timelines, accessed 2026-07-21.
- Analyst-entered project stages, status notes, AI evidence confidence, and illustrative binding constraints.
- Versioned scenario parameters in `src/data/catalog.ts`.

## Structure

1. Existing records are separated into operational share, raw catalogued current power, and probability-adjusted current power.
2. Known-project capacity is calculated per facility and reconciles exactly to state and national totals.
3. Unannounced capacity remains state-level and grows at a scenario rate limited by the tightest active constraint multiplier; it is never assigned to invented facility locations.
4. The interval widens with horizon using the scenario uncertainty parameter.
5. PUE, load factor, and WUE convert facility MW into IT MW, annual TWh, and illustrative direct cooling-water consumption.
6. A 0.95 power-factor assumption converts facility MW to a grid-supply MVA screen; transformer units, redundancy, voltage, and topology are intentionally not inferred.
7. A policy factor can multiply one existing state constraint channel only after primary-source, effective-date, quantitative-method, mechanism-identity, and reviewed GitHub approval gates pass. Its low/high factors widen the displayed interval.

EIA electricity, USGS historical water-use, and U.S. Drought Monitor fields are displayed as state context. They are not automatically used as causal inputs and do not establish grid headroom, facility consumption, water provider, source, right, or availability.

## What uncertainty means

The displayed low/high band is a transparent sensitivity envelope. It is not yet a calibrated 80%, 90%, or 95% prediction interval. Parameter correlations, model-form uncertainty, and geographic covariance require the hindcasting phase.

## Required calibration gate

Before a production forecast can claim calibrated coverage:

1. freeze several historical source cutoffs;
2. forecast using only information available at each cutoff;
3. compare commissioning, cancellation, capacity, and timing against later evidence;
4. report Brier score, interval coverage, absolute error, timing error, regional rank correlation, and reconciliation error;
5. stratify errors by source and classification-confidence tier;
6. replace demonstration completion weights with fitted, documented estimates where the evidence supports them.

The repository implements the required score functions for absolute capacity error, Brier score, interval coverage, timing error, regional rank correlation, and reconciliation error. `pnpm model:calibration-readiness` records whether the evidence preconditions exist. Release 0.2 is blocked: it contains one frozen source cutoff and no independent subsequent-outcome release. Historical-looking timeline rows inside the current snapshot are excluded because they may contain retrospective knowledge.

## Known limitations

- The input is not a U.S. census and favors large, well-documented AI facilities.
- Status and constraint fields need source-by-source analyst review.
- Facility power and H100 equivalents are upstream estimates.
- Output is quarterly from 2026-Q3 through 2030-Q4 and annual from 2031 through 2040; quarterly precision does not imply quarterly calibration.
- There is no calibrated siting model for unannounced projects.
- Direct water is coefficient-based. HUC-8 and principal-aquifer layers are spatial context only; withdrawal, indirect water, supply source, watershed stress, rights, and seasonal availability are not implemented.
- Legacy HIFLD control-area candidates are screening hints, are low confidence, and are excluded from forecast inputs pending serving-utility/topology confirmation.
- HIFLD retail-territory candidates are also low-confidence screens; 11 of 18 curated records overlap multiple candidates, and none affect forecasts.
- Land acreage coverage is zero for the curated release. Unknown acreage remains unknown; no universal acres-per-MW coefficient is used.
- No law, policy, or news item changes a parameter automatically; release 0.2 contains no approved state policy effects.
