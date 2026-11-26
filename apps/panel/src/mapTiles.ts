export interface TileHealth {
  status: "loading" | "ready" | "error";
  loaded: number;
  failed: number;
  attempt: number;
}

export const initialTileHealth: TileHealth = {
  status: "loading",
  loaded: 0,
  failed: 0,
  attempt: 0,
};

export function tileHealth(
  previous: TileHealth,
  event: "start" | "tileLoaded" | "tileFailed" | "complete" | "timeout",
): TileHealth {
  switch (event) {
    case "start":
      return { ...initialTileHealth, attempt: previous.attempt + 1 };
    case "tileLoaded":
      return { ...previous, loaded: previous.loaded + 1 };
    case "tileFailed":
      return { ...previous, status: "error", failed: previous.failed + 1 };
    case "complete":
      return {
        ...previous,
        status: previous.loaded && !previous.failed ? "ready" : "error",
      };
    case "timeout":
      return previous.status === "loading"
        ? { ...previous, status: "error" }
        : previous;
  }
}
