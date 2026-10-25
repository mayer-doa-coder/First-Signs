"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, LngLatLike, Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { BilingualText, useLanguage, type Copy } from "@/components/language";
import { Icon } from "@/components/icons";
import type { BroadArea } from "@/lib/broad-areas";
import { distanceKm, type Coordinates, type RankedCentre, type TbCentre } from "@/lib/tb-centres";

/**
 * Free, key-free OpenStreetMap-based vector tiles (no registration, no usage
 * limit) — see https://tiles.openfreemap.org/. This provider and the OSRM
 * demo router below require no API keys.
 */
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * Public OSRM demo routing server (no key, ~1 request/second fair-use limit —
 * see the Project-OSRM API usage policy). Used only for an illustrative
 * driving route; a straight line is shown instead if it is unreachable.
 */
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_FETCH_TIMEOUT_MS = 6_000;
const MAP_LOAD_TIMEOUT_MS = 8_000;
/** Radius of the "somewhere in this broad area" circle — deliberately coarse. */
const DIVISION_RADIUS_METERS = 40_000;
const LEGACY_AREA_RADIUS_METERS = 1_500;

type MapStatus = "checking" | "ready" | "unavailable";
type RouteStatus = "idle" | "loading" | "ready" | "unavailable";
type LocationStatus = "idle" | "requesting" | "ready" | "denied";

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

function toLngLat(point: Coordinates): LngLatLike {
  return [point.longitude, point.latitude];
}

/** A small circle polygon standing in for "somewhere in this broad area" — never an exact point. */
function areaCirclePolygon(center: Coordinates, radiusMeters: number): GeoJSON.Polygon {
  const pointCount = 48;
  const latitudeRadians = (center.latitude * Math.PI) / 180;
  const coordinates: [number, number][] = [];

  for (let index = 0; index <= pointCount; index += 1) {
    const angle = (index / pointCount) * 2 * Math.PI;
    const eastMeters = radiusMeters * Math.cos(angle);
    const northMeters = radiusMeters * Math.sin(angle);
    const deltaLongitude = eastMeters / (111_320 * Math.cos(latitudeRadians));
    const deltaLatitude = northMeters / 110_540;
    coordinates.push([center.longitude + deltaLongitude, center.latitude + deltaLatitude]);
  }

  return { type: "Polygon", coordinates: [coordinates] };
}

function straightLine(from: Coordinates, to: Coordinates): GeoJSON.LineString {
  return { type: "LineString", coordinates: [toLngLat(from), toLngLat(to)] as [number, number][] };
}

async function fetchDrivingRoute(from: Coordinates, to: Coordinates, signal: AbortSignal) {
  const url = `${OSRM_ROUTE_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`OSRM responded with HTTP ${response.status}`);

  const data = (await response.json()) as { routes?: Array<{ geometry?: GeoJSON.LineString; distance?: number }> };
  const route = data.routes?.[0];
  if (!route?.geometry || typeof route.distance !== "number") throw new Error("OSRM response is missing a route");

  return { geometry: route.geometry, distanceKm: route.distance / 1000 };
}

function googleMapsDirectionsUrl(origin: Coordinates, destination: Coordinates) {
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function popupNode(content: { title: string; lines: string[]; action?: { label: string; onClick: () => void } }) {
  const wrapper = document.createElement("div");
  wrapper.className = "centre-popup";

  const title = document.createElement("strong");
  title.textContent = content.title;
  wrapper.appendChild(title);

  for (const line of content.lines) {
    const paragraph = document.createElement("small");
    paragraph.textContent = line;
    wrapper.appendChild(paragraph);
  }

  if (content.action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "centre-popup-button";
    button.textContent = content.action.label;
    button.addEventListener("click", content.action.onClick);
    wrapper.appendChild(button);
  }

  return wrapper;
}

export function TbCentreMap({
  area,
  centre,
  alternates,
  onSelectCentre,
}: {
  area: BroadArea;
  centre: TbCentre;
  /** Other nearby centres to show as secondary pins, nearest first. */
  alternates: RankedCentre[];
  onSelectCentre: (centreId: string) => void;
}) {
  const { language } = useLanguage();
  const areaRadiusMeters = area.id.endsWith("Division") || ["Dhaka", "Chattogram", "Rajshahi", "Khulna", "Barishal", "Sylhet", "Rangpur", "Mymensingh"].includes(area.id)
    ? DIVISION_RADIUS_METERS
    : LEGACY_AREA_RADIUS_METERS;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [canUseWebGL] = useState(supportsWebGL);
  const [mapStatus, setMapStatus] = useState<MapStatus>(canUseWebGL ? "checking" : "unavailable");
  const [routeStatus, setRouteStatus] = useState<RouteStatus>("idle");
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const routeOrigin = currentLocation ?? area;

  function requestCurrentLocation() {
    if (!navigator.geolocation) { setLocationStatus("denied"); return; }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setCurrentLocation(location);
        setLocationStatus("ready");
        const nearestCentre = [centre, ...alternates.map((entry) => entry.centre)]
          .map((candidate) => ({ candidate, distance: distanceKm(location, candidate) }))
          .sort((left, right) => left.distance - right.distance)[0]?.candidate;
        if (nearestCentre && nearestCentre.id !== centre.id) onSelectCentreRef.current(nearestCentre.id);
      },
      () => setLocationStatus("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  // `onSelectCentre` is a new function on every parent render; keeping only
  // it behind a ref (updated here, never during render) means the marker
  // effect below does not need it as a dependency and so does not rebuild
  // the map on unrelated parent re-renders. `area`, `centre`, and `alternates`
  // are referentially stable per value in the caller, so they can be used as
  // ordinary effect dependencies.
  const onSelectCentreRef = useRef(onSelectCentre);
  useEffect(() => {
    onSelectCentreRef.current = onSelectCentre;
  });

  // Create the map once per broad area.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !canUseWebGL) return;

    let cancelled = false;
    let loadTimeout: number | undefined;

    void import("maplibre-gl").then((maplibregl) => {
      if (cancelled) return;

      // Turbopack cannot bundle MapLibre's internal Web Worker (it needs a
      // real static file, not a bundled module); point it at the static copy
      // instead — see scripts/copy-maplibre-worker.mjs.
      maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

      const map = new maplibregl.Map({
        container,
        style: MAP_STYLE_URL,
        center: toLngLat(area),
        zoom: 12,
        cooperativeGestures: true,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("error", (event) => {
        // Replace MapLibre's default console.error for tile/style failures
        // (for example, no network) with a clean, bilingual fallback.
        console.debug("TB centre map could not load a resource", event?.error);
        if (!cancelled) setMapStatus("unavailable");
      });

      map.on("load", () => {
        if (cancelled) return;
        window.clearTimeout(loadTimeout);
        setMapStatus("ready");
      });

      loadTimeout = window.setTimeout(() => {
        if (!cancelled && !map.loaded()) setMapStatus("unavailable");
      }, MAP_LOAD_TIMEOUT_MS);
    }).catch(() => {
      if (!cancelled) setMapStatus("unavailable");
    });

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimeout);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [area, canUseWebGL]);

  // Redraw markers, the area circle, and the route whenever the map becomes
  // ready or the selected/alternate centres change.
  useEffect(() => {
    const map = mapRef.current;
    if (mapStatus !== "ready" || !map) return;

    let cancelled = false;
    const abortController = new AbortController();
    void import("maplibre-gl").then((maplibreModule) => {
      if (cancelled) return;
      const maplibregl = maplibreModule;

      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      const bounds = new maplibregl.LngLatBounds();
      bounds.extend(toLngLat(routeOrigin));
      bounds.extend(toLngLat(centre));

      const areaMarker = new maplibregl.Marker({ color: "#277f80" })
        .setLngLat(toLngLat(area))
        .setPopup(
          new maplibregl.Popup({ offset: 20 }).setDOMContent(
            popupNode({
              title: language === "bn" ? `বিস্তৃত এলাকা: ${area.label.bn}` : `Broad area: ${area.label.en}`,
              lines: [
                language === "bn"
                  ? "এটি একটি আনুমানিক এলাকা, সঠিক ঠিকানা নয়।"
                  : "This is an approximate area, not an exact address.",
              ],
            }),
          ),
        )
        .addTo(map);
      markersRef.current.push(areaMarker);

      if (currentLocation) {
        const locationMarker = new maplibregl.Marker({ color: "#17394c" })
          .setLngLat(toLngLat(currentLocation))
          .setPopup(new maplibregl.Popup({ offset: 20 }).setDOMContent(popupNode({
            title: language === "bn" ? "আপনার বর্তমান অবস্থান" : "Your current location",
            lines: [language === "bn" ? "শুধু এই পথ দেখানোর জন্য ব্যবহার করা হচ্ছে; সংরক্ষণ করা হচ্ছে না।" : "Used only for this route; it is not saved."],
          })))
          .addTo(map);
        markersRef.current.push(locationMarker);
      }

      const centreMarker = new maplibregl.Marker({ color: "#176568" })
        .setLngLat(toLngLat(centre))
        .setPopup(
          new maplibregl.Popup({ offset: 20 }).setDOMContent(
            popupNode({
              title: centre.name[language],
              lines: [centre.area[language], centre.serviceType[language]],
            }),
          ),
        )
        .addTo(map);
      markersRef.current.push(centreMarker);

      for (const { centre: alternateCentre, distanceKm: alternateDistanceKm } of alternates) {
        bounds.extend(toLngLat(alternateCentre));
        const marker = new maplibregl.Marker({ color: "#8fa6a2", scale: 0.8 })
          .setLngLat(toLngLat(alternateCentre))
          .setPopup(
            new maplibregl.Popup({ offset: 18 }).setDOMContent(
              popupNode({
                title: alternateCentre.name[language],
                lines: [
                  `${alternateCentre.area[language]} · ${alternateCentre.serviceType[language]}`,
                  language === "bn"
                    ? `আনুমানিক ~${alternateDistanceKm.toFixed(1)} কিমি দূরে`
                    : `About ~${alternateDistanceKm.toFixed(1)} km away`,
                ],
                action: {
                  label: language === "bn" ? "এটি বেছে নিন" : "Select this centre",
                  onClick: () => onSelectCentreRef.current(alternateCentre.id),
                },
              }),
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      }

      if (map.getLayer("area-circle-fill")) map.removeLayer("area-circle-fill");
      if (map.getLayer("area-circle-line")) map.removeLayer("area-circle-line");
      if (map.getSource("area-circle")) map.removeSource("area-circle");
      map.addSource("area-circle", {
        type: "geojson",
        data: { type: "Feature", geometry: areaCirclePolygon(area, areaRadiusMeters), properties: {} },
      });
      map.addLayer({ id: "area-circle-fill", type: "fill", source: "area-circle", paint: { "fill-color": "#277f80", "fill-opacity": 0.12 } });
      map.addLayer({ id: "area-circle-line", type: "line", source: "area-circle", paint: { "line-color": "#277f80", "line-width": 1.5, "line-dasharray": [2, 2] } });

      if (map.getLayer("route-line")) map.removeLayer("route-line");
      if (map.getSource("route-line")) map.removeSource("route-line");
      map.addSource("route-line", {
        type: "geojson",
        data: { type: "Feature", geometry: straightLine(routeOrigin, centre), properties: {} },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route-line",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#176568", "line-width": 4, "line-dasharray": [0.1, 1.6] },
      });

      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 500 });

      setRouteStatus("loading");
      setRouteDistanceKm(null);
      const timeout = window.setTimeout(() => abortController.abort(), ROUTE_FETCH_TIMEOUT_MS);

      fetchDrivingRoute(routeOrigin, centre, abortController.signal)
        .then((route) => {
          window.clearTimeout(timeout);
          if (cancelled || map !== mapRef.current) return;
          const source = map.getSource("route-line") as GeoJSONSource | undefined;
          source?.setData({ type: "Feature", geometry: route.geometry, properties: {} });
          map.setPaintProperty("route-line", "line-dasharray", [1, 0]);
          setRouteStatus("ready");
          setRouteDistanceKm(route.distanceKm);
        })
        .catch(() => {
          window.clearTimeout(timeout);
          if (!cancelled) setRouteStatus("unavailable");
        });
    });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [mapStatus, area, areaRadiusMeters, centre, alternates, language, currentLocation, routeOrigin]);

  const directionsUrl = googleMapsDirectionsUrl(routeOrigin, centre);
  const directionsLabel: Copy = { bn: "Google মানচিত্রে দিকনির্দেশ দেখুন", en: "Open directions in Google Maps" };

  return (
    <div className="centre-map-wrap">
      <div className="centre-map-surface">
        <div className="centre-map-canvas" ref={containerRef} role="img" aria-label={`${area.label[language]} থেকে ${centre.name[language]} পর্যন্ত মানচিত্র / Map from ${area.label.en} to ${centre.name.en}`} />
        {mapStatus !== "ready" && (
          <div className="centre-map-fallback" role="status">
            <Icon name="location" />
            <p>
              <BilingualText copy={mapStatus === "checking"
                ? { bn: "মানচিত্র লোড হচ্ছে…", en: "Loading the map…" }
                : { bn: "ইন্টারেক্টিভ মানচিত্র এই মুহূর্তে দেখানো যাচ্ছে না। নিচের তথ্য ও দিকনির্দেশ লিংক ব্যবহার করুন।", en: "The interactive map is not available right now. Use the information and directions link below." }} />
            </p>
          </div>
        )}
      </div>
      <div className="centre-map-footer">
        <div className="centre-map-route-controls">
          <button className="button button-secondary" type="button" onClick={requestCurrentLocation} disabled={locationStatus === "requesting"}>
            <Icon name="location" />
            <BilingualText copy={locationStatus === "requesting" ? { bn: "অবস্থান নেওয়া হচ্ছে…", en: "Getting location…" } : locationStatus === "ready" ? { bn: "বর্তমান অবস্থান ব্যবহার হচ্ছে", en: "Using current location" } : { bn: "আমার বর্তমান অবস্থান ব্যবহার করুন", en: "Use my current location" }} />
          </button>
          <p className="centre-map-route-note">
            <BilingualText copy={{ bn: "সঠিক GPS অবস্থান শুধু এই পথের জন্য ব্যবহার হয় এবং সংরক্ষণ করা হয় না।", en: "Exact GPS is used only for this route and is never stored." }} />
          </p>
          {locationStatus === "denied" && <p className="centre-map-route-note" role="status"><BilingualText copy={{ bn: "অবস্থানের অনুমতি পাওয়া যায়নি। বিস্তৃত এলাকা দিয়ে পথ দেখানো হচ্ছে।", en: "Location permission was unavailable. The route uses your broad area instead." }} /></p>}
        </div>
        <p className="centre-map-route-note">
          {routeStatus === "ready" && routeDistanceKm !== null ? (
            <BilingualText copy={{
              bn: `আনুমানিক গাড়ির পথের দূরত্ব: ~${routeDistanceKm.toFixed(1)} কিমি (সরাসরি দূরত্ব নয়)।`,
              en: `Approximate driving route: ~${routeDistanceKm.toFixed(1)} km (not a straight-line distance).`,
            }} />
          ) : routeStatus === "loading" ? (
            <BilingualText copy={{ bn: "গাড়ির পথ খোঁজা হচ্ছে…", en: "Looking up a driving route…" }} />
          ) : routeStatus === "unavailable" ? (
            <BilingualText copy={{ bn: "রিয়েল-টাইম পথ পাওয়া যায়নি; সরাসরি রেখা দেখানো হচ্ছে।", en: "A real-time route could not be found; a straight line is shown instead." }} />
          ) : null}
        </p>
        <a className="button button-secondary" href={directionsUrl} target="_blank" rel="noopener noreferrer">
          <Icon name="location" />
          <BilingualText copy={directionsLabel} />
        </a>
      </div>
    </div>
  );
}
