export type GeographyStatus = "active" | "provisional" | "adapter-planned" | "license-review" | "coverage-gap";

export interface GeographyLayer {
  id: string;
  label: string;
  analyticalUnit: string;
  boundaryVersion: string;
  status: GeographyStatus;
  sourceId: string;
  purpose: string;
  crosswalkRule: string;
  uncertaintyHandling: string;
}

export const geographyLayers: GeographyLayer[] = [
  {
    id: "state",
    label: "State",
    analyticalUnit: "State / District equivalent",
    boundaryVersion: "Bundled U.S. state TopoJSON; release-pinned",
    status: "active",
    sourceId: "census-tiger-line",
    purpose: "Public navigation and state reconciliation.",
    crosswalkRule: "Facility state is retained from the source address and checked against the display point.",
    uncertaintyHandling: "A missing record is shown as no coverage, never as zero infrastructure.",
  },
  {
    id: "county",
    label: "County",
    analyticalUnit: "County or county equivalent",
    boundaryVersion: "Census Geocoder Current_Current accessed 2026-07-21; release-pinned",
    status: "active",
    sourceId: "census-geocoder",
    purpose: "Permits, land, hazards, water, community context, and sub-state aggregation.",
    crosswalkRule: "Use a public-address range match where available; otherwise use the disclosed city-level point and lower confidence.",
    uncertaintyHandling: "8 of 18 curated facilities address-match; 10 city-centroid fallbacks are Imputed and unsuitable for parcel or tract claims.",
  },
  {
    id: "tract",
    label: "Census tract",
    analyticalUnit: "Census tract",
    boundaryVersion: "Decennial/annual relationship vintage required",
    status: "adapter-planned",
    sourceId: "census-tiger-line",
    purpose: "Environmental-justice and community analysis where disclosure is appropriate.",
    crosswalkRule: "Point/parcel overlay with GEOID and relationship-file migration across vintages.",
    uncertaintyHandling: "Sensitive or city-level points are not assigned to a tract publicly.",
  },
  {
    id: "balancing-authority",
    label: "Balancing authority",
    analyticalUnit: "Balancing authority area",
    boundaryVersion: "HIFLD public-use control-area snapshot dated 2021-12-08; accessed 2026-07-21",
    status: "provisional",
    sourceId: "hifld-control-areas",
    purpose: "Load, generation, transfers, and regional electricity reconciliation.",
    crosswalkRule: "Use polygon containment only as a screening candidate. Utility service and electrical topology take precedence, and every current assignment is blocked from forecast inputs.",
    uncertaintyHandling: "16 of 18 records have one legacy polygon candidate and 2 intersect multiple candidates. All are low confidence; none are inferred solely from state or treated as confirmed current relationships.",
  },
  {
    id: "iso-rto",
    label: "ISO / RTO",
    analyticalUnit: "Market or system-operator region",
    boundaryVersion: "Operator membership/effective-date snapshot",
    status: "adapter-planned",
    sourceId: "ferc-large-load-2026",
    purpose: "Queue rules, tariffs, planning zones, and large-load policy analysis.",
    crosswalkRule: "Map through the serving utility/BA and effective membership date, not state alone.",
    uncertaintyHandling: "Non-RTO regions and vertically integrated utility areas remain explicit.",
  },
  {
    id: "utility-territory",
    label: "Utility territory",
    analyticalUnit: "Retail or transmission service territory",
    boundaryVersion: "HIFLD public-use retail-territory snapshot dated 2025-08-21; accessed 2026-07-21",
    status: "provisional",
    sourceId: "hifld-electric-retail-territories-2025",
    purpose: "Serving-utility commitments, rates, infrastructure, and interconnection responsibility.",
    crosswalkRule: "Use polygons only as candidate screens; confirm actual provider, tariff/service class, special contract, and interconnection from primary records before analytical use.",
    uncertaintyHandling: "7 of 18 records have one geometric candidate and 11 have multiple candidates, including up to 12. All remain low confidence and forecast-ineligible; overlaps are retained rather than forced to one provider.",
  },
  {
    id: "huc",
    label: "Watershed / HUC",
    analyticalUnit: "HUC-8 and HUC-12",
    boundaryVersion: "USGS WBD service and feature load date, accessed 2026-07-21",
    status: "active",
    sourceId: "usgs-wbd",
    purpose: "Direct withdrawal/consumption context, seasonal availability, and upstream/downstream effects.",
    crosswalkRule: "Release 0.1 uses HUC-8 only: transient address-range coordinate when available, otherwise the city-level display point.",
    uncertaintyHandling: "8 of 18 address-range matches are Estimated; 10 city-centroid fallbacks are Imputed. No HUC-12 or site-specific regulatory claim is made.",
  },
  {
    id: "aquifer",
    label: "Principal aquifer",
    analyticalUnit: "Principal aquifer / groundwater system",
    boundaryVersion: "USGS 2003 data release, 1:2,500,000; WFS accessed 2026-07-21",
    status: "active",
    sourceId: "usgs-principal-aquifers",
    purpose: "Groundwater-source feasibility and depletion/stress context.",
    crosswalkRule: "Intersect the transient address-range coordinate when available, otherwise the city-level point; retain the result only as regional spatial context.",
    uncertaintyHandling: "8 of 18 address-range matches are Estimated and 10 city-centroid fallbacks are Imputed. An underlying polygon never establishes the actual water source, a well, withdrawal, right, availability, or use.",
  },
  {
    id: "water-utility",
    label: "Water utility",
    analyticalUnit: "Retail water service territory",
    boundaryVersion: "Local/provider effective date",
    status: "coverage-gap",
    sourceId: "unresolved",
    purpose: "Supply commitments, potable/reclaimed mix, drought restrictions, and rate impacts.",
    crosswalkRule: "Primary-source service agreement or provider confirmation; geometry is supporting evidence only.",
    uncertaintyHandling: "There is no single comprehensive national public boundary source.",
  },
];
