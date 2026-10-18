import { describe, expect, it } from "vitest";
import { mapConfig } from "./mapConfig";
describe("map provider configuration", () => {
  it("preserves OSM attribution by default", () => {
    expect(mapConfig({}).url).toContain("tile.openstreetmap.org");
    expect(mapConfig({}).attribution).toContain("openstreetmap.org/copyright");
  });
  it("uses a configured institutional XYZ provider and its attribution", () => {
    expect(
      mapConfig({
        VITE_MAP_TILE_URL: "https://maps.example/tiles/{z}/{x}/{y}.png",
        VITE_MAP_ATTRIBUTION: "Cartografia institucional",
      }),
    ).toEqual({
      url: "https://maps.example/tiles/{z}/{x}/{y}.png",
      attribution: "Cartografia institucional",
    });
  });
  it("rejects missing credit, invalid templates, unsafe protocols and embedded passwords", () => {
    for (const config of [
      { VITE_MAP_TILE_URL: "https://maps.example/{z}/{x}/{y}" },
      {
        VITE_MAP_TILE_URL: "https://maps.example/static.png",
        VITE_MAP_ATTRIBUTION: "Mapas",
      },
      {
        VITE_MAP_TILE_URL: "http://maps.example/{z}/{x}/{y}",
        VITE_MAP_ATTRIBUTION: "Mapas",
      },
      {
        VITE_MAP_TILE_URL: "https://user:password@maps.example/{z}/{x}/{y}",
        VITE_MAP_ATTRIBUTION: "Mapas",
      },
    ])
      expect(() => mapConfig(config)).toThrow();
  });
  it("allows an HTTP tile server only on loopback during development", () => {
    expect(
      mapConfig({
        DEV: true,
        VITE_MAP_TILE_URL: "http://localhost:8080/{z}/{x}/{y}.png",
        VITE_MAP_ATTRIBUTION: "Local",
      }).url,
    ).toContain("localhost");
    expect(() =>
      mapConfig({
        DEV: false,
        VITE_MAP_TILE_URL: "http://localhost:8080/{z}/{x}/{y}.png",
        VITE_MAP_ATTRIBUTION: "Local",
      }),
    ).toThrow();
  });
});
