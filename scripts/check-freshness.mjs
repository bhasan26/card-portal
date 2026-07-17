#!/usr/bin/env node
/*
 * Reports on data that likely needs a human update:
 *   - offers expiring within 7 days, or already expired
 *   - the current-quarter Discover calendar being unset / "not yet announced"
 *
 * Writes a markdown summary to freshness-report.md and sets the GitHub Actions
 * output `attention=true|false`. The workflow opens/updates a reminder issue
 * only when attention is true, so you get nudged exactly when something changed.
 * Run locally: node scripts/check-freshness.mjs
 */
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(join(root, "data", "cards.json"), "utf8"));

const today = new Date();
today.setHours(0, 0, 0, 0);
const dayMs = 86400000;

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

const lines = [];

// 1. Offers needing attention.
const expiringSoon = [];
const expired = [];
for (const offer of data.offers || []) {
  const d = parseDate(offer.expires);
  if (!d) continue;
  const days = Math.round((d - today) / dayMs);
  if (days < 0) expired.push({ offer, days });
  else if (days <= 7) expiringSoon.push({ offer, days });
}

if (expiringSoon.length) {
  lines.push("### ⏳ Offers expiring within 7 days");
  for (const { offer, days } of expiringSoon) {
    lines.push(`- **${offer.card}** — ${offer.title} (${days === 0 ? "ends today" : days + "d left"})`);
  }
  lines.push("");
}
if (expired.length) {
  lines.push("### 🗑️ Expired offers (auto-hidden; remove when convenient)");
  for (const { offer } of expired) {
    lines.push(`- **${offer.card}** — ${offer.title} (expired ${offer.expires})`);
  }
  lines.push("");
}

// 2. Rotating calendar gaps for the current quarter.
const cal = data.discoverCalendar || {};
const year = String(today.getFullYear());
const q = "Q" + (Math.floor(today.getMonth() / 3) + 1);
const quarter = cal[year] && cal[year][q];
const cats = quarter && Array.isArray(quarter.categories) ? quarter.categories : [];
const unset = !cats.length || cats.some((c) => /not yet announced|tbd|verify/i.test(c));
if (unset) {
  lines.push(`### 📅 Discover ${year} ${q} categories need updating`);
  lines.push(
    `The current quarter (${q} ${year}) has no confirmed categories in \`data/cards.json\`. ` +
      "Check discover.com/credit-cards/cash-back/calendar and update the array."
  );
  lines.push("");
}

const attention = expiringSoon.length > 0 || expired.length > 0 || unset;

const body =
  (attention
    ? "Card Portal found data worth a quick look:\n\n" + lines.join("\n")
    : "Nothing needs attention — offers and the rotating calendar are current.") +
  `\n\n_Checked ${today.toISOString().slice(0, 10)} by the scheduled freshness job._`;

await writeFile(join(root, "freshness-report.md"), body + "\n", "utf8");

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `attention=${attention}\n`);
}

console.log(body);
