"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { BilingualText, useLanguage, type Copy } from "@/components/language";
import { broadAreas, getBroadArea, type BroadAreaId } from "@/lib/broad-areas";
import type { GovernmentAreaActivity, HotspotLevel } from "@/lib/government-dashboard";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export function hotspotLabel(level: HotspotLevel): Copy {
  if (level === "RED") return { bn: "লাল সতর্কতা", en: "Red warning" };
  if (level === "WATCH") return { bn: "নজরে রাখুন", en: "Watch" };
  return { bn: "স্বাভাবিক", en: "Normal" };
}

function activityGeoJson(areas: GovernmentAreaActivity[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: areas.flatMap((activity) => {
      const area = getBroadArea(activity.areaId);
      if (!area) return [];
      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [area.longitude, area.latitude] },
        properties: {
          areaId: activity.areaId,
          hotspotLevel: activity.hotspotLevel,
          count: activity.independentReferredUsers,
        },
      }];
    }),
  };
}

export function GovernmentActivityMap({ areas, selectedAreaId, onSelectArea }: { areas: GovernmentAreaActivity[]; selectedAreaId: BroadAreaId | null; onSelectArea: (areaId: BroadAreaId) => void }) {
  const { language } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelectArea);
  const initialAreasRef = useRef(areas);
  const [mapReady, setMapReady] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => { selectRef.current = onSelectArea; });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let timeout: number | undefined;
    void import("maplibre-gl").then((maplibregl) => {
      if (cancelled) return;
      maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({ container, style: MAP_STYLE_URL, center: [90.35, 23.7], zoom: 5.4, cooperativeGestures: true, attributionControl: { compact: true } });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => { if (!cancelled) setMapUnavailable(true); });
      map.on("load", () => {
        if (cancelled) return;
        window.clearTimeout(timeout);
        map.addSource("government-activity", { type: "geojson", data: activityGeoJson(initialAreasRef.current) });
        map.addLayer({
          id: "government-density",
          type: "circle",
          source: "government-activity",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "count"], 0, 14, 3, 24, 5, 34, 12, 52],
            "circle-color": ["match", ["get", "hotspotLevel"], "RED", "#b42318", "WATCH", "#b96b00", "#176568"],
            "circle-opacity": 0.56,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 3,
          },
        });
        map.addLayer({ id: "government-count", type: "symbol", source: "government-activity", layout: { "text-field": ["to-string", ["get", "count"]], "text-size": 13, "text-font": ["Noto Sans Regular"], "text-allow-overlap": true }, paint: { "text-color": "#ffffff", "text-halo-color": "#17394c", "text-halo-width": 1 } });
        map.on("click", "government-density", (event) => {
          const areaId = event.features?.[0]?.properties?.areaId as BroadAreaId | undefined;
          if (areaId) selectRef.current(areaId);
        });
        map.on("mouseenter", "government-density", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "government-density", () => { map.getCanvas().style.cursor = ""; });
        setMapReady(true);
      });
      timeout = window.setTimeout(() => { if (!cancelled && !map.loaded()) setMapUnavailable(true); }, 8_000);
    }).catch(() => setMapUnavailable(true));
    return () => { cancelled = true; window.clearTimeout(timeout); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    (mapRef.current?.getSource("government-activity") as GeoJSONSource | undefined)?.setData(activityGeoJson(areas));
  }, [areas, mapReady]);

  useEffect(() => {
    if (!mapReady || !selectedAreaId) return;
    const area = getBroadArea(selectedAreaId);
    if (area) mapRef.current?.easeTo({ center: [area.longitude, area.latitude], zoom: 7, duration: 500 });
  }, [selectedAreaId, mapReady]);

  return <div className="government-map-wrap">
    <div className="government-map-canvas government-map-real" ref={containerRef} role="img" aria-label={language === "bn" ? "বাংলাদেশের গোপনীয়তা-সুরক্ষিত সমষ্টিগত কার্যক্রমের বাস্তব মানচিত্র" : "Real map of privacy-safe aggregate activity across Bangladesh"} data-local-government-map />
    {!mapReady && <div className="government-map-loading" role="status"><BilingualText copy={mapUnavailable ? { bn: "মানচিত্রের টাইল এখন লোড করা যায়নি। নিচের এলাকার তালিকা ব্যবহার করুন।", en: "Map tiles could not load. Use the area list below." } : { bn: "বাস্তব মানচিত্র লোড হচ্ছে…", en: "Loading the real map…" }} /></div>}
    <div className="hotspot-area-selector" aria-label={language === "bn" ? "বিস্তৃত এলাকা বেছে নিন" : "Select a broad area"}>{areas.map((area) => {
      const broadArea = broadAreas.find((candidate) => candidate.id === area.areaId);
      return <button className={`hotspot-area-button hotspot-${area.hotspotLevel.toLowerCase()}${selectedAreaId === area.areaId ? " is-selected" : ""}`} type="button" key={area.areaId} onClick={() => onSelectArea(area.areaId)} aria-pressed={selectedAreaId === area.areaId}><span className="hotspot-area-dot" aria-hidden="true" /><span><BilingualText copy={broadArea?.label ?? { bn: area.areaId, en: area.areaId }} /></span><small><BilingualText copy={hotspotLabel(area.hotspotLevel)} /></small></button>;
    })}</div>
  </div>;
}
