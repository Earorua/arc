import { DOCUMENT_METADATA_TIMEOUT_MS } from "../../app/server/documents/provider-receipt";

/** Convert the obsolete RFC 850 and asctime HTTP-date formats to IMF-fixdate (RFC 9110 §5.6.7). */
function canonicalHttpDate(value: string, now: number): string {
  const rfc850 = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-([A-Z][a-z]{2})-(\d{2}) (\d{2}:\d{2}:\d{2}) GMT$/u.exec(value);
  if (rfc850) {
    const [, weekday, day, month, suffix, time] = rfc850;
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() + 50);
    const year = Math.floor(cutoff.getUTCFullYear() / 100) * 100 + Number(suffix);
    const format = (y: number) => weekday!.slice(0, 3) + ", " + day + " " + month + " " + y + " " + time + " GMT";
    return Date.parse(format(year)) > cutoff.getTime() ? format(year - 100) : format(year);
  }
  const asctime = /^([A-Z][a-z]{2}) ([A-Z][a-z]{2}) ( [1-9]|\d{2}) (\d{2}:\d{2}:\d{2}) (\d{4})$/u.exec(value);
  if (asctime) {
    const [, weekday, month, day, time, year] = asctime;
    return weekday + ", " + day!.trim().padStart(2, "0") + " " + month + " " + year + " " + time + " GMT";
  }
  return value;
}

/** Retain a bounded delay only. A value reaching the deadline cannot trigger a retry. */
export function boundedMetadataRetryAfter(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  const value = header.trim();
  if (/^\d+$/u.test(value)) return Math.min(DOCUMENT_METADATA_TIMEOUT_MS, Number(value) * 1000);
  if (value.length > 64) return undefined;
  const normalized = canonicalHttpDate(value, now);
  const date = Date.parse(normalized);
  if (!Number.isFinite(date) || new Date(date).toUTCString() !== normalized) return undefined;
  return Math.min(DOCUMENT_METADATA_TIMEOUT_MS, Math.max(0, date - now));
}
