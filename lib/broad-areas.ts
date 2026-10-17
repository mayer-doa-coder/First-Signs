import type { Copy } from "@/components/language";

export type NationalDivisionId = "Dhaka" | "Chattogram" | "Rajshahi" | "Khulna" | "Barishal" | "Sylhet" | "Rangpur" | "Mymensingh";
export type LegacyKhulnaAreaId = "Sonadanga" | "Khalishpur" | "Daulatpur" | "Boyra" | "Batiaghata";
export type BroadAreaId = NationalDivisionId | LegacyKhulnaAreaId;

export type BroadArea = {
  id: BroadAreaId;
  label: Copy;
  /**
   * Approximate, coarse division or legacy demo-area centroid — used only to estimate
   * which TB centre is nearest and to draw an approximate area marker on the
   * map. This is never the person's exact address or GPS position (PRD.md
   * "Safety Rules" and IMPLEMENTATION_GUIDE.md Step 11 both require this).
   *
   * Nationwide division centroids are coarse public map coordinates checked
   * against OpenStreetMap/Nominatim on 17 October 2026. Legacy Khulna demo
   * areas remain available only so persisted records and the seeded hotspot
   * rehearsal continue to render correctly.
   */
  latitude: number;
  longitude: number;
};

export const screeningAreas: readonly BroadArea[] = [
  { id: "Dhaka", label: { bn: "ঢাকা বিভাগ", en: "Dhaka Division" }, latitude: 23.8103, longitude: 90.4125 },
  { id: "Chattogram", label: { bn: "চট্টগ্রাম বিভাগ", en: "Chattogram Division" }, latitude: 22.3569, longitude: 91.7832 },
  { id: "Rajshahi", label: { bn: "রাজশাহী বিভাগ", en: "Rajshahi Division" }, latitude: 24.3745, longitude: 88.6042 },
  { id: "Khulna", label: { bn: "খুলনা বিভাগ", en: "Khulna Division" }, latitude: 22.8456, longitude: 89.5403 },
  { id: "Barishal", label: { bn: "বরিশাল বিভাগ", en: "Barishal Division" }, latitude: 22.701, longitude: 90.3535 },
  { id: "Sylhet", label: { bn: "সিলেট বিভাগ", en: "Sylhet Division" }, latitude: 24.8949, longitude: 91.8687 },
  { id: "Rangpur", label: { bn: "রংপুর বিভাগ", en: "Rangpur Division" }, latitude: 25.7439, longitude: 89.2752 },
  { id: "Mymensingh", label: { bn: "ময়মনসিংহ বিভাগ", en: "Mymensingh Division" }, latitude: 24.7471, longitude: 90.4203 },
];

export const legacyKhulnaDemoAreas: readonly BroadArea[] = [
  { id: "Sonadanga", label: { bn: "সোনাডাঙ্গা", en: "Sonadanga" }, latitude: 22.8167, longitude: 89.55 },
  { id: "Khalishpur", label: { bn: "খালিশপুর", en: "Khalishpur" }, latitude: 22.85, longitude: 89.5361 },
  { id: "Daulatpur", label: { bn: "দৌলতপুর", en: "Daulatpur" }, latitude: 22.8875, longitude: 89.5167 },
  { id: "Boyra", label: { bn: "বয়রা", en: "Boyra" }, latitude: 22.839267, longitude: 89.535984 },
  { id: "Batiaghata", label: { bn: "বটিয়াঘাটা", en: "Batiaghata" }, latitude: 22.7417, longitude: 89.5167 },
];

export const broadAreas: readonly BroadArea[] = [...screeningAreas, ...legacyKhulnaDemoAreas];

export function getBroadArea(id: string | null | undefined) {
  return broadAreas.find((area) => area.id === id);
}
