"use client";

import { BilingualText, useLanguage, type Copy } from "@/components/language";
import { broadAreas, getBroadArea, type BroadAreaId } from "@/lib/broad-areas";
import type { GovernmentAreaActivity, HotspotLevel } from "@/lib/government-dashboard";

const MAP_PADDING_PERCENT = 12;

const coordinateBounds = broadAreas.reduce(
  (bounds, area) => ({
    minLatitude: Math.min(bounds.minLatitude, area.latitude),
    maxLatitude: Math.max(bounds.maxLatitude, area.latitude),
    minLongitude: Math.min(bounds.minLongitude, area.longitude),
    maxLongitude: Math.max(bounds.maxLongitude, area.longitude),
  }),
  {
    minLatitude: Number.POSITIVE_INFINITY,
    maxLatitude: Number.NEGATIVE_INFINITY,
    minLongitude: Number.POSITIVE_INFINITY,
    maxLongitude: Number.NEGATIVE_INFINITY,
  },
);

export function hotspotLabel(level: HotspotLevel): Copy {
  if (level === "RED") return { bn: "লাল সতর্কতা", en: "Red warning" };
  if (level === "WATCH") return { bn: "নজরে রাখুন", en: "Watch" };
  return { bn: "স্বাভাবিক", en: "Normal" };
}

function markerLabel(area: GovernmentAreaActivity, language: "bn" | "en") {
  const broadArea = getBroadArea(area.areaId);
  const name = broadArea?.label[language] ?? area.areaId;
  const level = hotspotLabel(area.hotspotLevel)[language];
  return language === "bn"
    ? `${name}: ${level}; স্বতন্ত্র রেফার করা ব্যবহারকারী ${area.independentReferredUsers}`
    : `${name}: ${level}; ${area.independentReferredUsers} independent referred users`;
}

function mapPosition(areaId: BroadAreaId) {
  const area = getBroadArea(areaId);
  if (!area) return { left: 50, top: 50 };

  const usablePercent = 100 - (MAP_PADDING_PERCENT * 2);
  const longitudeRange = coordinateBounds.maxLongitude - coordinateBounds.minLongitude;
  const latitudeRange = coordinateBounds.maxLatitude - coordinateBounds.minLatitude;
  return {
    left: MAP_PADDING_PERCENT + (((area.longitude - coordinateBounds.minLongitude) / longitudeRange) * usablePercent),
    top: MAP_PADDING_PERCENT + (((coordinateBounds.maxLatitude - area.latitude) / latitudeRange) * usablePercent),
  };
}

export function GovernmentActivityMap({
  areas,
  selectedAreaId,
  onSelectArea,
}: {
  areas: GovernmentAreaActivity[];
  selectedAreaId: BroadAreaId | null;
  onSelectArea: (areaId: BroadAreaId) => void;
}) {
  const { language } = useLanguage();

  return (
    <div className="government-map-wrap">
      <div
        className="government-map-canvas government-map-schematic"
        role="group"
        aria-label={language === "bn" ? "বাংলাদেশের গোপনীয়তা-সুরক্ষিত কার্যক্রমের মানচিত্র" : "Privacy-safe activity map of Bangladesh"}
        data-local-government-map
      >
        <svg className="government-map-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M20 0V100M40 0V100M60 0V100M80 0V100M0 20H100M0 40H100M0 60H100M0 80H100" />
          <path className="government-map-axis" d="M50 6V94M6 50H94" />
        </svg>
        <span className="government-map-north" lang="en" aria-hidden="true">N ↑</span>
        <span className="government-map-caption"><BilingualText copy={{ bn: "বাংলাদেশজুড়ে বিভাগ ও ডেমো এলাকার আনুমানিক অবস্থান", en: "Approximate division and demo-area positions across Bangladesh" }} /></span>

        {areas.map((area) => {
          const position = mapPosition(area.areaId);
          return (
            <button
              className={`hotspot-map-marker hotspot-${area.hotspotLevel.toLowerCase()}${selectedAreaId === area.areaId ? " is-selected" : ""}`}
              type="button"
              key={area.areaId}
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
              onClick={() => onSelectArea(area.areaId)}
              aria-label={markerLabel(area, language)}
              aria-pressed={selectedAreaId === area.areaId}
              data-hotspot-marker={area.areaId}
              lang={language}
            >
              {new Intl.NumberFormat(language === "bn" ? "bn-BD" : "en-BD").format(area.independentReferredUsers)}
            </button>
          );
        })}
      </div>

      <div className="hotspot-area-selector" aria-label={language === "bn" ? "বিস্তৃত এলাকা বেছে নিন" : "Select a broad area"}>
        {areas.map((area) => {
          const broadArea = broadAreas.find((candidate) => candidate.id === area.areaId);
          return (
            <button
              className={`hotspot-area-button hotspot-${area.hotspotLevel.toLowerCase()}${selectedAreaId === area.areaId ? " is-selected" : ""}`}
              type="button"
              key={area.areaId}
              onClick={() => onSelectArea(area.areaId)}
              aria-pressed={selectedAreaId === area.areaId}
            >
              <span className="hotspot-area-dot" aria-hidden="true" />
              <span><BilingualText copy={broadArea?.label ?? { bn: area.areaId, en: area.areaId }} /></span>
              <small><BilingualText copy={hotspotLabel(area.hotspotLevel)} /></small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
