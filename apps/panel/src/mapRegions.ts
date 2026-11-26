export const mapRegions = {
  rondonia: {
    label: "Rondônia",
    center: [-10.8, -62.9] as [number, number],
    zoom: 7,
  },
  ariquemes: {
    label: "Ariquemes",
    center: [-9.911, -63.04] as [number, number],
    zoom: 14,
  },
  rolim: {
    label: "Rolim de Moura",
    center: [-11.7271, -61.7714] as [number, number],
    zoom: 14,
  },
} as const;

export type MapRegion = keyof typeof mapRegions;

export function mapRegion(value: string): MapRegion {
  return Object.hasOwn(mapRegions, value) ? (value as MapRegion) : "rondonia";
}
