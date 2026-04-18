// lib/digest/week-id.mjs
//
// Computes ISO 8601 week identifiers using the Europe/Brussels timezone so
// that the digest guard and the stored weekId agree on week boundaries
// regardless of DST transitions (clocks go forward last Sunday of March,
// back last Sunday of October).
//
// ISO 8601 week rules:
//   - Weeks start on Monday.
//   - Week 1 of year Y is the week containing the first Thursday of year Y.
//     Equivalently: the week containing January 4th of year Y.
//
// Algorithm source: "Calculate ISO 8601 week number from a date"
//   https://weeknumber.com/how-to/javascript
//   The key insight: shift the date to the nearest Thursday (add days to land
//   on Thursday: date + (4 − weekday) where weekday is 1=Mon…7=Sun as per
//   ISO), then count whole weeks from 1 January of the Thursday's year.

/**
 * Return the ISO 8601 week identifier for a given instant, using the
 * Europe/Brussels calendar date for that instant.
 *
 * @param {Date} [date=new Date()]
 * @returns {string}  e.g. "2026-W16"
 */
export function weekIdBrussels(date = new Date()) {
  // Step 1 — derive the calendar date in Europe/Brussels.
  // `en-CA` locale produces "YYYY-MM-DD"; no manual offset arithmetic needed;
  // DST transitions (March / October) are handled transparently by Intl.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const partsMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const year = parseInt(partsMap.year, 10);
  const month = parseInt(partsMap.month, 10) - 1; // 0-based for Date constructor
  const day = parseInt(partsMap.day, 10);

  // Step 2 — run the ISO-week algorithm on a UTC noon of that Brussels date.
  // Using noon (12:00 UTC) avoids any DST edge that could shift the UTC date.
  const d = new Date(Date.UTC(year, month, day, 12, 0, 0));

  // ISO weekday: 1 = Monday … 7 = Sunday
  const isoWeekday = d.getUTCDay() || 7; // getUTCDay(): 0=Sun → remap to 7

  // Shift to the nearest Thursday (ISO Thursday = weekday 4).
  // Adding (4 − isoWeekday) lands on Thursday; negative values go back, positive go forward.
  d.setUTCDate(d.getUTCDate() + (4 - isoWeekday));

  // The ISO year is the year of that Thursday.
  const isoYear = d.getUTCFullYear();

  // Week number = ceil of (day-of-year-of-thursday + 1) / 7
  // "Day of year" is relative to Jan 1 at UTC midnight.
  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(((d - jan1) / 86_400_000 + 1) / 7);

  return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
}
