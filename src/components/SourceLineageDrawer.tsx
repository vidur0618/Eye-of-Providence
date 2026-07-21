import type { MapLayerKey, StateResourceContext } from "../domain/types";

export function SourceLineageDrawer({ layer, context, modelVersion }: { layer: MapLayerKey; context: StateResourceContext | null; modelVersion: string }) {
  return <details className="lineage-drawer">
    <summary>Source lineage & equations <span>Inspect this view</span></summary>
    <div className="lineage-grid">
      <section><p className="eyebrow">Displayed layer</p><h3>{layer.replaceAll("-", " ")}</h3><p>Every state fill is derived from the same scenario, period, and selected release as the charts and table.</p></section>
      <section><p className="eyebrow">Forecast equations</p><code>known MW = Σ facility ramp</code><code>state MW = known MW + unannounced state growth</code><code>TWh = MW × load factor × 8,760 ÷ 1,000,000</code><code>MGD = IT MW × 1,000 × 24 × WUE ÷ 3,785,411.784</code><span>Model {modelVersion}</span></section>
      <section><p className="eyebrow">Reported context</p>{context ? context.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>) : <p>Select a state for source links.</p>}<small>Reported conditions remain context; they do not automatically change forecasts.</small></section>
    </div>
  </details>;
}
