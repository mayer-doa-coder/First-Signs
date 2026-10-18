import "server-only";

export type HealthSource = { title: string; url: string; excerpt: string };

const sources: HealthSource[] = [
  { title: "WHO: Tuberculosis", url: "https://www.who.int/health-topics/tuberculosis", excerpt: "Tuberculosis is preventable and curable. Symptoms can include prolonged cough, fever, night sweats, weight loss, or blood in sputum. Testing and clinical evaluation are needed to diagnose it." },
  { title: "WHO: TB diagnosis", url: "https://www.who.int/publications/i/item/9789240089488", excerpt: "TB diagnosis requires appropriate tests and clinical assessment. A symptom screen or an AI signal cannot confirm or rule out TB." },
  { title: "Bangladesh National Tuberculosis Program", url: "https://www.ntp.gov.bd/guidelines/", excerpt: "Bangladesh NTP publishes TB guidance and service information. A verified TB centre can provide formal evaluation and testing." },
  { title: "WHO: TB care and support", url: "https://www.who.int/publications/i/item/9789240053519", excerpt: "TB medicines and treatment choices require qualified clinical care. People should ask a clinician or pharmacist before starting, stopping, or changing a medicine." },
];

function words(value: string) {
  return new Set(value.toLowerCase().match(/[a-z\u0980-\u09ff]{3,}/g) ?? []);
}

function rank(query: string, source: HealthSource) {
  const queryWords = words(query); const sourceWords = words(`${source.title} ${source.excerpt}`);
  return [...queryWords].filter((word) => sourceWords.has(word)).length;
}

function plainText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2_000);
}

async function officialRefresh(source: HealthSource) {
  if (process.env.HEALTH_ASSISTANT_WEB_RETRIEVAL === "false") return source;
  try {
    const response = await fetch(source.url, { headers: { "user-agent": "First-Signs-health-assistant/1.0" }, cache: "no-store", signal: AbortSignal.timeout(3_500) });
    if (!response.ok) return source;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return source;
    const excerpt = plainText(await response.text());
    return excerpt.length >= 120 ? { ...source, excerpt } : source;
  } catch { return source; }
}

/** Retrieves only allow-listed official material; excerpts are response-local. */
export async function retrieveHealthSources(query: string) {
  const selected = [...sources].sort((a, b) => rank(query, b) - rank(query, a)).slice(0, 3);
  return Promise.all(selected.map(officialRefresh));
}
