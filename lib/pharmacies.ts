import type { Copy } from "@/components/language";

export type DemoPharmacy = {
  id: string;
  name: Copy;
  area: Copy;
  active: boolean;
};

export const demoPharmacies: readonly DemoPharmacy[] = [
  {
    id: "DEMO-KHL-RAHMAN",
    name: { bn: "রহমান ফার্মেসি", en: "Rahman Pharmacy" },
    area: { bn: "সোনাডাঙ্গা, খুলনা", en: "Sonadanga, Khulna" },
    active: true,
  },
  {
    id: "DEMO-KHL-CITY",
    name: { bn: "সিটি ফার্মেসি", en: "City Pharmacy" },
    area: { bn: "বয়রা, খুলনা", en: "Boyra, Khulna" },
    active: true,
  },
  {
    id: "DEMO-KHL-SHAPLA",
    name: { bn: "শাপলা ফার্মেসি", en: "Shapla Pharmacy" },
    area: { bn: "খালিশপুর, খুলনা", en: "Khalishpur, Khulna" },
    active: true,
  },
  {
    id: "DEMO-KHL-MAA",
    name: { bn: "মা ফার্মেসি", en: "Maa Pharmacy" },
    area: { bn: "দৌলতপুর, খুলনা", en: "Daulatpur, Khulna" },
    active: true,
  },
  {
    id: "DEMO-KHL-CARE",
    name: { bn: "খুলনা কেয়ার ফার্মেসি", en: "Khulna Care Pharmacy" },
    area: { bn: "রূপসা, খুলনা", en: "Rupsha, Khulna" },
    active: true,
  },
  {
    id: "DEMO-KHL-BATIAGHATA",
    name: { bn: "বটিয়াঘাটা মডেল ফার্মেসি", en: "Batiaghata Model Pharmacy" },
    area: { bn: "বটিয়াঘাটা, খুলনা", en: "Batiaghata, Khulna" },
    active: true,
  },
  {
    id: "DEMO-KHL-PADMA",
    name: { bn: "পদ্মা ফার্মেসি", en: "Padma Pharmacy" },
    area: { bn: "ফুলতলা, খুলনা", en: "Fultala, Khulna" },
    active: true,
  },
  {
    id: "DEMO-KHL-KOYRA",
    name: { bn: "কয়রা কমিউনিটি ফার্মেসি", en: "Koyra Community Pharmacy" },
    area: { bn: "কয়রা, খুলনা", en: "Koyra, Khulna" },
    active: true,
  },
  {
    id: "DEMO-KHL-PAIKGACHA",
    name: { bn: "পাইকগাছা ফার্মেসি", en: "Paikgacha Pharmacy" },
    area: { bn: "পাইকগাছা, খুলনা", en: "Paikgacha, Khulna" },
    active: true,
  },
  {
    id: "DEMO-KHL-RUPSHA",
    name: { bn: "রূপসা ফার্মেসি", en: "Rupsha Pharmacy" },
    area: { bn: "রূপসা, খুলনা", en: "Rupsha, Khulna" },
    active: true,
  },
];

const legacyPharmacyAliases: Readonly<Record<string, string>> = {
  PHARMACY_001: "DEMO-KHL-RAHMAN",
  PHARMACY_002: "DEMO-KHL-CITY",
  PHARMACY_003: "DEMO-KHL-SHAPLA",
};

export const defaultDemoPharmacy = demoPharmacies[0];

export function getPharmacyScreeningPath(pharmacyId: string) {
  const query = new URLSearchParams({ source: "pharmacy", pharmacy: pharmacyId });
  return `/screen?${query.toString()}`;
}

export function getActivePharmacy(pharmacyId: string | undefined) {
  if (!pharmacyId) return undefined;

  const normalizedId = pharmacyId.trim().toUpperCase();
  const canonicalId = legacyPharmacyAliases[normalizedId] ?? normalizedId;
  return demoPharmacies.find(
    (pharmacy) => pharmacy.active && pharmacy.id === canonicalId,
  );
}
