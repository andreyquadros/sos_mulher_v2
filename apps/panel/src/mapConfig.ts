const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
export function mapConfig(env: Record<string, string | boolean | undefined>) {
  const url = String(env.VITE_MAP_TILE_URL || OSM_URL).trim();
  const attribution = String(
    env.VITE_MAP_ATTRIBUTION || (url === OSM_URL ? OSM_ATTRIBUTION : ""),
  ).trim();
  const parsed = new URL(
    url
      .replace("{s}", "a")
      .replaceAll("{z}", "0")
      .replaceAll("{x}", "0")
      .replaceAll("{y}", "0"),
  );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    parsed.protocol !== "https:" &&
    !(env.DEV && local && parsed.protocol === "http:")
  )
    throw new Error(
      "VITE_MAP_TILE_URL exige HTTPS (HTTP apenas no desenvolvimento local).",
    );
  if (parsed.username || parsed.password)
    throw new Error("Não inclua credenciais privadas na URL do mapa.");
  if (!["{z}", "{x}", "{y}"].every((token) => url.includes(token)))
    throw new Error(
      "VITE_MAP_TILE_URL deve conter os parâmetros {z}, {x} e {y}.",
    );
  if (!attribution)
    throw new Error(
      "Configure VITE_MAP_ATTRIBUTION para o provedor de mapas escolhido.",
    );
  return { url, attribution };
}
