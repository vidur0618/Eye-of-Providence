import { renderToString } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("observatory application", () => {
  it("server-renders the national map and evidence framing", () => {
    const html = renderToString(<App />);
    expect(html).toContain("Key of Providence");
    expect(html).toContain("United States synchronized state forecast map");
    expect(html).toContain("Reported context ≠ forecast input");
    expect(html).toContain("Alaska");
    expect(html).toContain("Hawaii");
    expect(html).toContain("50-state synchronized ledger");
    expect(html).toContain("Forecast");
    expect(html).toContain("Scenario");
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("advances playback at 900 ms and pauses on manual interaction", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<App />));
    const range = container.querySelector<HTMLInputElement>('input[aria-label^="Forecast period"]')!;
    const start = Number(range.value);
    const play = container.querySelector<HTMLButtonElement>('button[aria-label="Play forecast"]')!;
    await act(async () => play.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(900));
    expect(Number(range.value)).toBe(start + 1);
    const layer = [...container.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Map layer"))!.querySelector("select")!;
    layer.value = "water-drought";
    await act(async () => layer.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.querySelector('button[aria-label="Play forecast"]')).not.toBeNull();
    expect(window.location.search).toContain("layer=water-drought");
    await act(async () => root.unmount());
    container.remove();
  });

  it("selecting a table row synchronizes state evidence and the shareable URL", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<App />));
    const alabama = [...container.querySelectorAll<HTMLButtonElement>(".state-forecast-table tbody button")].find((button) => button.textContent?.includes("Alabama"))!;
    await act(async () => alabama.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector(".research-panel h3")?.textContent).toBe("Alabama");
    expect(window.location.search).toContain("state=AL");
    expect(container.querySelector(".us-map")?.getAttribute("aria-labelledby")).toContain("map-title");
    await act(async () => root.unmount());
    container.remove();
  });

  it("has no automatically detectable serious accessibility violations", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<App />));
    const results = await axe.run(container, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    axe.reset();
    await act(async () => root.unmount());
    container.remove();
    expect(serious).toEqual([]);
  });
});
