import { describe, expect, it } from "vitest";
import { initialTileHealth, tileHealth } from "./mapTiles";
import { mapRegion, mapRegions } from "./mapRegions";

describe("base-map availability", () => {
  it("only reports loaded when a complete batch has tiles and no failure", () => {
    expect(tileHealth(initialTileHealth, "complete").status).toBe("error");
    const loaded = tileHealth(initialTileHealth, "tileLoaded");
    expect(loaded.status).toBe("loading");
    expect(tileHealth(loaded, "complete").status).toBe("ready");
    expect(tileHealth(tileHealth(loaded, "complete"), "timeout").status).toBe(
      "ready",
    );
  });
  it("preserves a partial failure when the remaining tiles finish", () => {
    const failed = tileHealth(initialTileHealth, "tileFailed");
    const partial = tileHealth(failed, "tileLoaded");
    expect(tileHealth(partial, "complete").status).toBe("error");
  });
  it("recovers after a new successful request batch and detects timeouts", () => {
    const timedOut = tileHealth(initialTileHealth, "timeout");
    expect(timedOut.status).toBe("error");
    const retry = tileHealth(timedOut, "start");
    expect(retry.failed).toBe(0);
    expect(retry.attempt).toBeGreaterThan(timedOut.attempt);
    expect(tileHealth(tileHealth(retry, "tileLoaded"), "complete").status).toBe(
      "ready",
    );
  });
});

describe("regional map navigation", () => {
  it("opens Rolim de Moura independently from Ariquemes", () => {
    expect(mapRegions[mapRegion("rolim")].center).toEqual([-11.7271, -61.7714]);
    expect(mapRegions.rolim.center).not.toEqual(mapRegions.ariquemes.center);
    expect(mapRegions.rolim.zoom).toBe(14);
  });
  it("falls back to a statewide overview for an unknown region", () => {
    expect(mapRegion("__proto__")).toBe("rondonia");
    expect(mapRegions[mapRegion("missing")].zoom).toBeLessThan(10);
  });
});
