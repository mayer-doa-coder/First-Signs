import type { Copy } from "@/components/language";

export type TbCentre = {
  id: string;
  name: Copy;
  district: Copy;
  area: Copy;
  serviceType: Copy;
  latitude: number;
  longitude: number;
};

const microscopy: Copy = { bn: "মাইক্রোস্কপি", en: "Microscopy" };
const khulna: Copy = { bn: "খুলনা", en: "Khulna" };
const confirmTesting: Copy = {
  bn: "টিবি মূল্যায়ন — পরীক্ষার বর্তমান প্রাপ্যতা নিশ্চিত করুন",
  en: "TB evaluation — confirm current test availability",
};

/**
 * Nationwide government referral hospitals. Facility identity and map
 * coordinates were cross-checked against OpenStreetMap/Nominatim on
 * 17 October 2026. Specific diagnostic availability can change, so the UI
 * deliberately asks the person to confirm the available test before travel.
 * The existing Khulna entries below retain their NTP-listed microscopy data.
 */
const nationwideReferralCentres: readonly TbCentre[] = [
  { id: "BD-DHA-NIDCH", name: { bn: "জাতীয় বক্ষব্যাধি ইনস্টিটিউট ও হাসপাতাল", en: "National Institute of Diseases of the Chest and Hospital" }, district: { bn: "ঢাকা", en: "Dhaka" }, area: { bn: "মহাখালী", en: "Mohakhali" }, serviceType: confirmTesting, latitude: 23.7757437, longitude: 90.4094176 },
  { id: "BD-CTG-CMCH", name: { bn: "চট্টগ্রাম মেডিকেল কলেজ হাসপাতাল", en: "Chittagong Medical College Hospital" }, district: { bn: "চট্টগ্রাম", en: "Chattogram" }, area: { bn: "চট্টগ্রাম শহর", en: "Chattogram City" }, serviceType: confirmTesting, latitude: 22.3593346, longitude: 91.830657 },
  { id: "BD-RAJ-RMCH", name: { bn: "রাজশাহী মেডিকেল কলেজ হাসপাতাল", en: "Rajshahi Medical College Hospital" }, district: { bn: "রাজশাহী", en: "Rajshahi" }, area: { bn: "রাজশাহী শহর", en: "Rajshahi City" }, serviceType: confirmTesting, latitude: 24.3730464, longitude: 88.5871186 },
  { id: "BD-BAR-SBMCH", name: { bn: "শের-ই-বাংলা মেডিকেল কলেজ হাসপাতাল", en: "Sher-e-Bangla Medical College Hospital" }, district: { bn: "বরিশাল", en: "Barishal" }, area: { bn: "বরিশাল শহর", en: "Barishal City" }, serviceType: confirmTesting, latitude: 22.6864652, longitude: 90.3617364 },
  { id: "BD-SYL-OMCH", name: { bn: "এম এ জি ওসমানী মেডিকেল কলেজ হাসপাতাল", en: "M.A.G. Osmani Medical College Hospital" }, district: { bn: "সিলেট", en: "Sylhet" }, area: { bn: "কাজলশাহ", en: "Kajolshah" }, serviceType: confirmTesting, latitude: 24.9020252, longitude: 91.8535767 },
  { id: "BD-RNG-RMCH", name: { bn: "রংপুর মেডিকেল কলেজ হাসপাতাল", en: "Rangpur Medical College Hospital" }, district: { bn: "রংপুর", en: "Rangpur" }, area: { bn: "ধাপ", en: "Dhap" }, serviceType: confirmTesting, latitude: 25.7673241, longitude: 89.2327154 },
  { id: "BD-MYM-MMCH", name: { bn: "ময়মনসিংহ মেডিকেল কলেজ হাসপাতাল", en: "Mymensingh Medical College Hospital" }, district: { bn: "ময়মনসিংহ", en: "Mymensingh" }, area: { bn: "ময়মনসিংহ শহর", en: "Mymensingh City" }, serviceType: confirmTesting, latitude: 24.7415116, longitude: 90.4092469 },
];

export const tbCentres: readonly TbCentre[] = [
  ...nationwideReferralCentres,
  { id: "NTP-KHL-BATIAGHATA", name: { bn: "বটিয়াঘাটা উপজেলা স্বাস্থ্য কমপ্লেক্স", en: "UHC Batiaghata" }, district: khulna, area: { bn: "বটিয়াঘাটা", en: "Batiaghata" }, serviceType: microscopy, latitude: 22.73853, longitude: 89.514479 },
  { id: "NTP-KHL-DACOPE", name: { bn: "দাকোপ উপজেলা স্বাস্থ্য কমপ্লেক্স", en: "UHC Dacope" }, district: khulna, area: { bn: "দাকোপ", en: "Dacope" }, serviceType: microscopy, latitude: 22.599848, longitude: 89.517771 },
  { id: "NTP-KHL-DIGHALIA", name: { bn: "দিঘলিয়া উপজেলা স্বাস্থ্য কমপ্লেক্স", en: "UHC Dighalia" }, district: khulna, area: { bn: "দিঘলিয়া", en: "Dighalia" }, serviceType: microscopy, latitude: 22.872988, longitude: 89.524585 },
  { id: "NTP-KHL-DUMURIA", name: { bn: "ডুমুরিয়া উপজেলা স্বাস্থ্য কমপ্লেক্স", en: "UHC Dumuria" }, district: khulna, area: { bn: "ডুমুরিয়া", en: "Dumuria" }, serviceType: microscopy, latitude: 22.809993, longitude: 89.410562 },
  { id: "NTP-KHL-PAIKGACHA", name: { bn: "পাইকগাছা উপজেলা স্বাস্থ্য কমপ্লেক্স", en: "UHC Paikgacha" }, district: khulna, area: { bn: "পাইকগাছা", en: "Paikgacha" }, serviceType: microscopy, latitude: 22.594345, longitude: 89.318243 },
  { id: "NTP-KHL-KMCH", name: { bn: "খুলনা মেডিকেল কলেজ হাসপাতাল", en: "Khulna Medical College Hospital (KMCH)" }, district: khulna, area: { bn: "সোনাডাঙ্গা", en: "Sonadanga" }, serviceType: microscopy, latitude: 22.82894, longitude: 89.537463 },
  { id: "NTP-KHL-RUPSHA", name: { bn: "রূপসা উপজেলা স্বাস্থ্য কমপ্লেক্স", en: "UHC Rupsha" }, district: khulna, area: { bn: "রূপসা", en: "Rupsha" }, serviceType: microscopy, latitude: 22.797848, longitude: 89.641167 },
  { id: "NTP-KHL-TEROKHADA", name: { bn: "তেরখাদা উপজেলা স্বাস্থ্য কমপ্লেক্স", en: "UHC Terokhoda" }, district: khulna, area: { bn: "তেরখাদা", en: "Terokhada" }, serviceType: microscopy, latitude: 22.92819, longitude: 89.67285 },
  { id: "NTP-KHL-AAMCHK", name: { bn: "আদ-দ্বীন আকিজ মেডিকেল কলেজ হাসপাতাল", en: "Ad din Akij Medical College Hospital (AAMCHK)" }, district: khulna, area: { bn: "দিঘলিয়া", en: "Dighalia" }, serviceType: microscopy, latitude: 22.8414, longitude: 89.538762 },
  { id: "NTP-KHL-FULTALA", name: { bn: "ফুলতলা উপজেলা স্বাস্থ্য কমপ্লেক্স", en: "UHC Fultala" }, district: khulna, area: { bn: "ফুলতলা", en: "Fultala" }, serviceType: microscopy, latitude: 22.958509, longitude: 89.454586 },
  { id: "NTP-KHL-KOYRA", name: { bn: "কয়রা উপজেলা স্বাস্থ্য কমপ্লেক্স", en: "UHC Koyra" }, district: khulna, area: { bn: "কয়রা", en: "Koyra" }, serviceType: microscopy, latitude: 21.970031, longitude: 89.431978 },
  { id: "NTP-KHL-KAPILMONI", name: { bn: "কপিলমুনি হাসপাতাল", en: "Kapilmoni Hospital" }, district: khulna, area: { bn: "কপিলমুনি", en: "Kapilmoni" }, serviceType: microscopy, latitude: 22.675006, longitude: 89.330177 },
  { id: "NTP-KHL-BALIADANGA", name: { bn: "বালিয়াডাঙ্গা পরিবার কল্যাণ কেন্দ্র", en: "FWC Balia Danga" }, district: khulna, area: { bn: "বালিয়াডাঙ্গা", en: "Balia Danga" }, serviceType: microscopy, latitude: 22.718874, longitude: 89.548702 },
  { id: "NTP-KHL-BAJUA", name: { bn: "বাজুয়া ইউনিয়ন পরিষদ", en: "UP Bajua" }, district: khulna, area: { bn: "বাজুয়া", en: "Bajua" }, serviceType: microscopy, latitude: 22.559964, longitude: 89.546299 },
  { id: "NTP-KHL-PIME", name: { bn: "পিমে সিস্টার্স", en: "PIME Sisters" }, district: khulna, area: { bn: "বড় বয়রা", en: "Boro Boyra" }, serviceType: microscopy, latitude: 22.839267, longitude: 89.535984 },
];

export function getTbCentre(centreId: string | null | undefined) {
  return tbCentres.find((centre) => centre.id === centreId);
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export type Coordinates = { latitude: number; longitude: number };

/** Great-circle distance in kilometres between two coarse coordinates. */
export function distanceKm(from: Coordinates, to: Coordinates) {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const chordSquared =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(chordSquared)));
}

export type RankedCentre = { centre: TbCentre; distanceKm: number };

/**
 * Every TB centre ranked by straight-line distance from a broad area's
 * coarse centroid, nearest first. This is a prototype approximation of
 * "shortest path" — it never uses the person's exact location.
 */
export function rankCentresByDistance(origin: Coordinates): RankedCentre[] {
  return tbCentres
    .map((centre) => ({
      centre,
      distanceKm: distanceKm(origin, { latitude: centre.latitude, longitude: centre.longitude }),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * The recommended TB centre for a broad area: the nearest one, or the next
 * nearest when `excludeId` names a centre that should not be recommended
 * (Step 28: "if not found/available, choose the 2nd shortest").
 */
export function getRecommendedCentre(origin: Coordinates, options?: { excludeId?: string }): RankedCentre | undefined {
  const ranked = rankCentresByDistance(origin);
  if (!options?.excludeId) return ranked[0];
  return ranked.find((entry) => entry.centre.id !== options.excludeId) ?? ranked[0];
}
