import { useEffect, useReducer, useRef, useState } from "react";
import L from "leaflet";
import { Crosshair, Layers, MapPin, Route, WifiOff } from "lucide-react";
import type { Incident, LocationPoint } from "./types";
import { age, duration } from "./api";
import { mapConfig } from "./mapConfig";
import { mapRegion, mapRegions, type MapRegion } from "./mapRegions";
import { initialTileHealth, tileHealth } from "./mapTiles";
const tilesConfig = mapConfig(import.meta.env);
interface Props {
  incidents: Incident[];
  selected: Incident | null;
  trail: LocationPoint[];
  now: number;
  onSelect: (id: string) => void;
}
export default function MapView({
  incidents,
  selected,
  trail,
  now,
  onSelect,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const [follow, setFollow] = useState(true);
  const [region, setRegion] = useState<MapRegion>("rondonia");
  const [tileStatus, updateTiles] = useReducer(tileHealth, initialTileHealth);
  const tileState = tileStatus.status;
  const select = useRef(onSelect);
  select.current = onSelect;
  const stalenessKey = incidents
    .map((i) => `${i.id}:${(age(i.lastLocation?.capturedAt, now) ?? 999) > 60}`)
    .join(",");
  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      zoomControl: false,
      center: mapRegions.rondonia.center,
      zoom: mapRegions.rondonia.zoom,
      attributionControl: true,
    });
    map.current = instance;
    L.control.zoom({ position: "topright" }).addTo(instance);
    L.control
      .scale({ position: "bottomleft", imperial: false })
      .addTo(instance);
    tiles.current = L.tileLayer(tilesConfig.url, {
      attribution: tilesConfig.attribution,
      referrerPolicy: tilesConfig.referrerPolicy,
      maxZoom: 19,
      keepBuffer: 2,
    })
      .on("loading", () => updateTiles("start"))
      .on("tileload", () => updateTiles("tileLoaded"))
      .on("tileerror", () => updateTiles("tileFailed"))
      .on("load", () => updateTiles("complete"))
      .addTo(instance);
    instance.on("dragstart", () => setFollow(false));
    layer.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      tiles.current = null;
      layer.current = null;
    };
  }, []);
  useEffect(() => {
    if (tileState !== "loading") return;
    const timeout = window.setTimeout(() => updateTiles("timeout"), 12_000);
    return () => window.clearTimeout(timeout);
  }, [tileState, tileStatus.attempt]);
  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    const clear = () => {
      group.eachLayer((item) => {
        if (item instanceof L.Marker) item.unbindTooltip();
      });
      group.clearLayers();
    };
    clear();
    for (const incident of incidents) {
      const p = incident.lastLocation;
      if (!p) continue;
      const stale = (age(p.capturedAt, now) ?? 999) > 60;
      const color =
        incident.status === "resolved"
          ? "#79a4df"
          : stale
            ? "#edbd65"
            : incident.status === "assigned"
              ? "#78b2df"
              : "#ed4f82";
      const isSelected = incident.id === selected?.id;
      if (isSelected)
        L.circle([p.latitude, p.longitude], {
          radius: p.accuracy,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.12,
          dashArray: stale ? "5 6" : undefined,
        }).addTo(group);
      const marker = L.marker([p.latitude, p.longitude], {
        icon: L.icon({
          iconUrl: `/markers/${stale ? "stale" : incident.status === "assigned" || incident.status === "resolved" ? "assigned" : "new"}.svg`,
          iconSize: isSelected ? [48, 57] : [36, 43],
          iconAnchor: isSelected ? [24, 46] : [18, 34],
        }),
        keyboard: true,
        title: `${incident.code}${incident.simulated ? " · simulado" : ""}${stale ? " · posição antiga" : ""}`,
      }).addTo(group);
      const label = document.createElement("span");
      label.textContent =
        incident.code + (incident.simulated ? " · TESTE" : "");
      marker
        .bindTooltip(label, {
          direction: "bottom",
          permanent: true,
          className: `incident-tooltip ${isSelected ? "selected" : ""}`,
          offset: [0, 13],
        })
        .on("click", () => select.current(incident.id));
    }
    if (trail.length > 1)
      L.polyline(
        [...trail]
          .sort((a, b) => a.sequence - b.sequence)
          .map((p) => [p.latitude, p.longitude] as [number, number]),
        { color: "#e6b1cb", weight: 3, opacity: 0.8, dashArray: "5 7" },
      ).addTo(group);
    return clear;
  }, [incidents, selected?.id, trail, stalenessKey]);
  useEffect(() => {
    if (follow && selected?.lastLocation)
      map.current?.setView(
        [selected.lastLocation.latitude, selected.lastLocation.longitude],
        Math.max(map.current.getZoom(), 14),
        { animate: true },
      );
  }, [selected?.id, selected?.lastLocation?.sequence, follow]);
  const p = selected?.lastLocation;
  const stale = !!p && (age(p.capturedAt, now) ?? 0) > 60;
  return (
    <section className="map-card" aria-label="Mapa de ocorrências em Rondônia">
      <div ref={host} className="map-canvas" />
      <div className="map-heading">
        <span className="map-region-control">
          <MapPin size={13} />
          <select
            aria-label="Centralizar mapa por região"
            value={follow && p ? "incident" : region}
            onChange={(event) => {
              if (event.target.value === "incident" && p) {
                setFollow(true);
                map.current?.setView([p.latitude, p.longitude], 16);
                return;
              }
              const next = mapRegion(event.target.value);
              setRegion(next);
              setFollow(false);
              map.current?.setView(
                mapRegions[next].center,
                mapRegions[next].zoom,
              );
            }}
          >
            {p && <option value="incident">Ocorrência selecionada</option>}
            {Object.entries(mapRegions).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </select>
        </span>
        <span className={`map-live ${tileState}`} role="status">
          <span className="status-dot" />{" "}
          {tileState === "ready"
            ? "MAPA CARREGADO"
            : tileState === "error"
              ? "FALHA NO MAPA BASE"
              : "CARREGANDO MAPA"}
        </span>
      </div>
      <div className="map-tools">
        <button
          className={follow ? "active" : ""}
          onClick={() => {
            setFollow(!follow);
            if (!follow && p)
              map.current?.setView([p.latitude, p.longitude], 16);
          }}
          aria-pressed={follow}
          title={
            follow
              ? "Desativar acompanhamento da posição"
              : "Acompanhar posição selecionada"
          }
        >
          <Crosshair size={18} />
        </button>
        <button
          onClick={() => {
            const points = incidents.flatMap((i) =>
              i.lastLocation
                ? [
                    [i.lastLocation.latitude, i.lastLocation.longitude] as [
                      number,
                      number,
                    ],
                  ]
                : [],
            );
            if (points.length) {
              setFollow(false);
              map.current?.fitBounds(L.latLngBounds(points), {
                padding: [65, 65],
                maxZoom: 16,
              });
            } else
              map.current?.setView(
                mapRegions[region].center,
                mapRegions[region].zoom,
              );
          }}
          title="Enquadrar todas as ocorrências"
        >
          <Layers size={18} />
        </button>
      </div>
      {tileState === "error" && (
        <div className="map-warning" role="alert">
          <WifiOff size={15} />
          <span>
            O provedor não carregou todo o mapa base. Confira a conexão ou tente
            novamente. As coordenadas permanecem disponíveis na ocorrência.
          </span>
          <button
            onClick={() => {
              updateTiles("start");
              tiles.current?.redraw();
            }}
          >
            Recarregar
          </button>
        </div>
      )}
      <div className="map-bottom">
        <div className="map-legend">
          <span className="legend-dot" />
          {p
            ? `Área de precisão · ±${Math.round(p.accuracy)} m`
            : "Aguardando coordenadas do dispositivo"}
        </div>
        {trail.length > 1 && (
          <span className="map-trail">
            <Route size={14} />
            {trail.length} posições na trilha
          </span>
        )}
      </div>
      {stale && tileState !== "error" && (
        <div className="stale-overlay">
          Posição antiga · capturada há {duration(age(p?.capturedAt, now))}
        </div>
      )}
    </section>
  );
}
