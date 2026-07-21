import type { ProvenanceClass } from "../domain/types";

export function ProvenanceBadge({ kind }: { kind: ProvenanceClass }) {
  return <span className={`provenance-badge provenance-${kind.toLowerCase().replaceAll(" ", "-")}`}>{kind}</span>;
}
