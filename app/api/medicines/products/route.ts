import { medicines } from "@/lib/medicines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DailyMedSearch = { data?: Array<{ setid?: string; title?: string; published_date?: string }> };
type DailyMedMedia = { data?: { media?: Array<{ url?: string; mime_type?: string; name?: string }> } };
type DailyMedPackaging = { data?: { products?: Array<{ product_name?: string; product_name_generic?: string; active_ingredients?: Array<{ name?: string; strength?: string }>; packaging?: Array<{ ndc?: string; package_descriptions?: string[] }> }> } };

export type VerifiedProduct = {
  setId: string;
  labelTitle: string;
  productName: string | null;
  genericName: string | null;
  activeIngredients: Array<{ name: string; strength: string | null }>;
  ndcs: string[];
  packaging: string[];
  imageUrls: string[];
  labelUrl: string;
  publishedDate: string | null;
};

type CachedResult = { expiresAt: number; products: VerifiedProduct[] };
const cache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DAILYMED = "https://dailymed.nlm.nih.gov/dailymed/services/v2";

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function isDailyMedImage(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "dailymed.nlm.nih.gov" && url.pathname === "/dailymed/image.cfm";
  } catch {
    return false;
  }
}

async function dailyMedJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" }, next: { revalidate: 21600 } });
  if (!response.ok) throw new Error(`DailyMed returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function toVerifiedProduct(entry: { setid?: string; title?: string; published_date?: string }): Promise<VerifiedProduct | null> {
  const setId = asString(entry.setid);
  if (!setId || !/^[a-f0-9-]{36}$/i.test(setId)) return null;

  const [mediaResult, packagingResult] = await Promise.allSettled([
    dailyMedJson<DailyMedMedia>(`${DAILYMED}/spls/${encodeURIComponent(setId)}/media.json`),
    dailyMedJson<DailyMedPackaging>(`${DAILYMED}/spls/${encodeURIComponent(setId)}/packaging.json`),
  ]);
  const media = mediaResult.status === "fulfilled" ? mediaResult.value.data?.media ?? [] : [];
  const packageProducts = packagingResult.status === "fulfilled" ? packagingResult.value.data?.products ?? [] : [];
  const firstProduct = packageProducts[0];
  const imageUrls = media.flatMap((item) => {
    const url = asString(item.url);
    return url && item.mime_type?.startsWith("image/") && isDailyMedImage(url) ? [url] : [];
  }).slice(0, 4);

  return {
    setId,
    labelTitle: asString(entry.title) ?? "DailyMed product label",
    productName: asString(firstProduct?.product_name),
    genericName: asString(firstProduct?.product_name_generic),
    activeIngredients: (firstProduct?.active_ingredients ?? []).flatMap((ingredient) => {
      const name = asString(ingredient.name);
      return name ? [{ name, strength: asString(ingredient.strength) }] : [];
    }),
    ndcs: (firstProduct?.packaging ?? []).flatMap((pack) => {
      const ndc = asString(pack.ndc);
      return ndc ? [ndc] : [];
    }),
    packaging: (firstProduct?.packaging ?? []).flatMap((pack) => pack.package_descriptions?.filter((item): item is string => typeof item === "string") ?? []),
    imageUrls,
    labelUrl: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setId)}`,
    publishedDate: asString(entry.published_date),
  };
}

export async function getVerifiedProducts(medicineId: string): Promise<VerifiedProduct[]> {
  const medicine = medicines.find((item) => item.id === medicineId);
  if (!medicine) throw new Error("Unknown medicine");
  const cached = cache.get(medicineId);
  if (cached && cached.expiresAt > Date.now()) return cached.products;

  const searchUrl = new URL(`${DAILYMED}/spls.json`);
  searchUrl.searchParams.set("drug_name", medicine.genericName.en);
  searchUrl.searchParams.set("name_type", "generic");
  searchUrl.searchParams.set("pagesize", "12");
  const search = await dailyMedJson<DailyMedSearch>(searchUrl.toString());
  const candidates = (search.data ?? []).slice(0, 12);
  const results = await Promise.allSettled(candidates.map(toVerifiedProduct));
  const products = results.flatMap((result) => result.status === "fulfilled" && result.value?.imageUrls.length ? [result.value] : []).slice(0, 6);
  cache.set(medicineId, { expiresAt: Date.now() + CACHE_TTL_MS, products });
  return products;
}

export async function GET(request: Request) {
  const medicineId = new URL(request.url).searchParams.get("medicineId")?.trim().toLowerCase();
  if (!medicineId || !medicines.some((medicine) => medicine.id === medicineId)) {
    return Response.json({ error: "Unknown medicine." }, { status: 400 });
  }
  try {
    const products = await getVerifiedProducts(medicineId);
    return Response.json({ products }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "Verified product photos are unavailable right now." }, { status: 503 });
  }
}
