/**
 * One place for the two values the IDE API compares: the `mod` of a func
 * record and the hash of its source.
 */
import * as crypto from 'crypto';

/** sha256 of `text` as lower-case hex (the "hash" of the IDE API). */
export function sha256Hex(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * A `mod` value as an ISO 8601 UTC string with milliseconds, or null.
 *
 * Accepts a Haystack date-time (it has a `date` field), a JS Date, or an ISO
 * string (a trailing time zone name, as in Zinc, is ignored). Both the export
 * and the stale-write check use this function, so a `mod` that the server
 * sent always compares equal to itself.
 */
export function modToIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'object' && (value as any).date instanceof Date) {
    date = (value as any).date;
  } else if (typeof value === 'string') {
    const iso = value.trim().split(/\s+/)[0];
    // The zone is required ("Z" or an offset). JS reads a date-time with no
    // zone as local time, so the result would depend on the zone of the server.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) return null;
    date = new Date(iso);
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Milliseconds since the epoch for an ISO `mod`, or null when it is not a date. */
export function modToMillis(value: unknown): number | null {
  const iso = modToIso(value);
  return iso === null ? null : new Date(iso).getTime();
}
