export type MessagingEntrySource =
  | { source: "SELF" }
  | { source: "PHARMACY"; pharmacyId: string };
function normalizedTelegramUsername(value: string | undefined) {
  const username = value?.trim().replace(/^@/, "") ?? "";
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : null;
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
