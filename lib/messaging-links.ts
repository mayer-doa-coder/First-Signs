export type MessagingEntrySource =
  | { source: "SELF" }
  | { source: "PHARMACY"; pharmacyId: string };

function normalizedWhatsAppNumber(value: string | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

function normalizedTelegramUsername(value: string | undefined) {
  const username = value?.trim().replace(/^@/, "") ?? "";
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : null;
}

export function whatsappEntryLink(number: string, entry: MessagingEntrySource) {
  const normalized = normalizedWhatsAppNumber(number);
  if (!normalized) return null;
  const text = entry.source === "SELF"
    ? "START SELF"
    : `START PHARMACY ${entry.pharmacyId}`;
  const url = new URL(`https://wa.me/${normalized}`);
  url.searchParams.set("text", text);
  return url.toString();
}

export function telegramEntryLink(username: string, entry: MessagingEntrySource) {
  const normalized = normalizedTelegramUsername(username);
  if (!normalized) return null;
  const payload = entry.source === "SELF"
    ? "self"
    : `pharmacy_${entry.pharmacyId}`;
  const url = new URL(`https://t.me/${normalized}`);
  url.searchParams.set("start", payload);
  return url.toString();
}

export function configuredMessagingLinks(entry: MessagingEntrySource) {
  return {
    whatsapp: whatsappEntryLink(process.env.WHATSAPP_BUSINESS_NUMBER ?? "", entry),
    telegram: telegramEntryLink(process.env.TELEGRAM_BOT_USERNAME ?? "", entry),
  };
}
