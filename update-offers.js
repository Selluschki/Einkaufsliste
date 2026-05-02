#!/usr/bin/env node

/**
 * update-offers.js
 * Updates the meta section of offers.json with the current German calendar week.
 * Optionally validates week dates against the kaufDA public API.
 *
 * Usage: node update-offers.js
 * Requires: Node 18+ (built-in fetch) or node-fetch installed
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OFFERS_PATH = join(__dirname, "offers.json");

// ─── ISO week helpers ──────────────────────────────────────────────────────────

/**
 * Returns the ISO 8601 week number (1–53) for a given date.
 * Weeks start on Monday; week 1 is the week containing the first Thursday of the year.
 */
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO weekday: Monday = 1 … Sunday = 7
  const dayOfWeek = d.getUTCDay() || 7;
  // Set to nearest Thursday (makes the week's year unambiguous)
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86_400_000) + 1) / 7);
}

/**
 * Returns the ISO week number AND the year that "owns" that week.
 * (A week in early January may belong to the previous year, and vice-versa.)
 */
function getISOWeekYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  return { week: getISOWeekNumber(date), year: d.getUTCFullYear() };
}

/**
 * Given an ISO week number and year, returns the Monday of that week as a Date (UTC).
 */
function mondayOfISOWeek(week, year) {
  // 4 January is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // Mon=1 … Sun=7
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1));
  const result = new Date(weekOneMonday);
  result.setUTCDate(weekOneMonday.getUTCDate() + (week - 1) * 7);
  return result;
}

/**
 * Formats a Date to "YYYY-MM-DD" (UTC).
 */
function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Formats a Date to a German day.month string, e.g. "5.5." or "11.5."
 */
function toGermanShort(date) {
  const d = date.getUTCDate();
  const m = date.getUTCMonth() + 1;
  return `${d}.${m}.`;
}

/**
 * Full German month name.
 */
const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄  update-offers.js gestartet …\n");

  // ── 1. Calculate current week dates ─────────────────────────────────────────
  const now = new Date();
  console.log(`📅  Heutiges Datum : ${toDateString(now)}`);

  const { week, year } = getISOWeekYear(now);
  console.log(`📆  ISO-Kalenderwoche : KW ${week} (${year})`);

  const monday = mondayOfISOWeek(week, year);
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5); // Monday + 5 = Saturday
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const validFrom = toDateString(monday);
  const validUntil = toDateString(saturday); // offers typically valid Mon–Sat

  // Build the German week label, e.g. "KW 19 · 5.–11. Mai 2026"
  // If the week spans two months, show both, e.g. "29. Apr.–5. Mai 2026"
  let weekLabel;
  if (monday.getUTCMonth() === saturday.getUTCMonth()) {
    const monthDE = MONTHS_DE[monday.getUTCMonth()];
    weekLabel = `KW ${week} · ${monday.getUTCDate()}.–${saturday.getUTCDate()}. ${monthDE} ${year}`;
  } else {
    const fromDE = toGermanShort(monday);
    const toDE = `${saturday.getUTCDate()}. ${MONTHS_DE[saturday.getUTCMonth()]}`;
    weekLabel = `KW ${week} · ${fromDE}–${toDE} ${year}`;
  }

  console.log(`🗓️   Wochenlabel     : ${weekLabel}`);
  console.log(`✅  Gültig von      : ${validFrom}`);
  console.log(`✅  Gültig bis      : ${validUntil}\n`);

  // ── 2. Optional: verify via kaufDA public API ────────────────────────────────
  const KAUFDA_URL =
    "https://www.kaufda.de/webapp/api/v1/leaflets?lang=de&lat=51.1657&lng=10.4515&limit=5";

  console.log("🌐  Versuche kaufDA-API …");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000); // 8 s timeout

    const response = await fetch(KAUFDA_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; offers-updater/1.0)",
        Accept: "application/json",
      },
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const count = data?.leaflets?.length ?? data?.data?.length ?? "?";
      console.log(
        `✅  kaufDA-API erreichbar – ${count} Prospekte gefunden. Berechnete Daten werden verwendet.\n`
      );
    } else {
      console.warn(
        `⚠️   kaufDA-API antwortete mit HTTP ${response.status}. Weiter mit berechneten Daten.\n`
      );
    }
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("⚠️   kaufDA-API Timeout (>8 s). Weiter mit berechneten Daten.\n");
    } else {
      console.warn(`⚠️   kaufDA-API nicht erreichbar: ${err.message}\n     Weiter mit berechneten Daten.\n`);
    }
  }

  // ── 3. Load existing offers.json ─────────────────────────────────────────────
  console.log(`📂  Lese ${OFFERS_PATH} …`);
  let offersData;
  try {
    const raw = readFileSync(OFFERS_PATH, "utf-8");
    offersData = JSON.parse(raw);
    console.log("✅  offers.json erfolgreich geladen.\n");
  } catch (err) {
    console.error(`❌  Fehler beim Lesen von offers.json: ${err.message}`);
    process.exit(1);
  }

  // ── 4. Update ONLY the meta section ─────────────────────────────────────────
  const updatedTimestamp = new Date().toISOString().replace("Z", "+02:00").replace(/\.\d{3}/, "");

  offersData.meta = {
    ...offersData.meta,         // preserve any extra meta fields
    updated: updatedTimestamp,
    week: weekLabel,
    validFrom,
    validUntil,
    source: "auto-updated",
  };

  console.log("📝  Meta-Sektion aktualisiert:");
  console.log(`     updated    : ${offersData.meta.updated}`);
  console.log(`     week       : ${offersData.meta.week}`);
  console.log(`     validFrom  : ${offersData.meta.validFrom}`);
  console.log(`     validUntil : ${offersData.meta.validUntil}\n`);

  // ── 5. Save updated offers.json ──────────────────────────────────────────────
  console.log(`💾  Schreibe ${OFFERS_PATH} …`);
  try {
    writeFileSync(OFFERS_PATH, JSON.stringify(offersData, null, 2), "utf-8");
  } catch (err) {
    console.error(`❌  Fehler beim Schreiben von offers.json: ${err.message}`);
    process.exit(1);
  }

  // ── 6. Done ──────────────────────────────────────────────────────────────────
  console.log(`✅  offers.json aktualisiert für ${weekLabel}`);
}

main().catch((err) => {
  console.error("❌  Unerwarteter Fehler:", err);
  process.exit(1);
});
