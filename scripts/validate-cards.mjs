#!/usr/bin/env node
/*
 * Validates data/cards.json so a typo in the reward rules can't silently
 * ship. Run with: node scripts/validate-cards.mjs
 * Exits non-zero on any error (used by CI before deploy).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "data", "cards.json");

const errors = [];
const warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

function isFiniteNumber(n) { return typeof n === "number" && Number.isFinite(n); }

async function main() {
  let raw;
  try {
    raw = await readFile(dataPath, "utf8");
  } catch (e) {
    console.error(`Cannot read ${dataPath}: ${e.message}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`data/cards.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(data.categories) || data.categories.length === 0) {
    err("`categories` must be a non-empty array.");
  }
  if (!Array.isArray(data.cards) || data.cards.length === 0) {
    err("`cards` must be a non-empty array.");
  }

  const categoryIds = new Set();
  (data.categories || []).forEach((cat, i) => {
    if (!cat || typeof cat.id !== "string" || !cat.id) err(`categories[${i}] is missing an id.`);
    else if (categoryIds.has(cat.id)) err(`Duplicate category id "${cat.id}".`);
    else categoryIds.add(cat.id);
    if (cat && typeof cat.label !== "string") err(`Category "${cat.id}" is missing a label.`);
  });

  if (!categoryIds.has("everything-else")) {
    err('Categories must include an "everything-else" fallback.');
  }

  const cardIds = new Set();
  (data.cards || []).forEach((card, i) => {
    const where = card && card.id ? `card "${card.id}"` : `cards[${i}]`;
    if (!card || typeof card.id !== "string" || !card.id) err(`cards[${i}] is missing an id.`);
    else if (cardIds.has(card.id)) err(`Duplicate card id "${card.id}".`);
    else cardIds.add(card.id);

    if (!card.name) err(`${where} is missing a name.`);
    if (card.unit !== "cash" && card.unit !== "miles") {
      err(`${where} has invalid unit "${card.unit}" (expected "cash" or "miles").`);
    }
    if (!Array.isArray(card.rules) || card.rules.length === 0) {
      err(`${where} must have at least one rule.`);
      return;
    }

    const seen = new Set();
    let hasFallback = false;
    card.rules.forEach((rule, j) => {
      if (!rule || typeof rule.category !== "string") {
        err(`${where} rules[${j}] is missing a category.`);
        return;
      }
      if (!categoryIds.has(rule.category)) {
        err(`${where} references unknown category "${rule.category}".`);
      }
      if (seen.has(rule.category)) {
        err(`${where} lists category "${rule.category}" more than once.`);
      }
      seen.add(rule.category);
      if (rule.category === "everything-else") hasFallback = true;
      if (!isFiniteNumber(rule.rate) || rule.rate < 0) {
        err(`${where} rule "${rule.category}" has an invalid rate (${rule.rate}).`);
      }
    });
    if (!hasFallback) {
      warn(`${where} has no "everything-else" rule; it won't rank for unlisted categories.`);
    }
  });

  // Validate optional offers.
  if (data.offers !== undefined) {
    if (!Array.isArray(data.offers)) {
      err("`offers` must be an array when present.");
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      data.offers.forEach((offer, i) => {
        const where = `offers[${i}]`;
        if (!offer || typeof offer !== "object") {
          err(`${where} must be an object.`);
          return;
        }
        if (!cardIds.has(offer.card)) {
          err(`${where} references unknown card "${offer.card}".`);
        }
        if (!offer.title) err(`${where} is missing a title.`);
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(offer.expires || ""));
        if (!m) {
          err(`${where} has an invalid expires "${offer.expires}" (expected YYYY-MM-DD).`);
        } else {
          const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          if (isNaN(d.getTime())) err(`${where} has an unparseable expires "${offer.expires}".`);
          else if (d < today) warn(`${where} ("${offer.title}") already expired — it won't show (safe to leave or remove).`);
        }
        if (offer.url && !/^https?:\/\//.test(offer.url)) {
          err(`${where} url must start with http(s):// if present.`);
        }
      });
    }
  }

  // Flag categories no card can earn on (dead options in the dropdown).
  const usedCategories = new Set();
  (data.cards || []).forEach((card) => {
    (card.rules || []).forEach((rule) => usedCategories.add(rule.category));
  });
  categoryIds.forEach((id) => {
    if (id === "everything-else") return;
    if (!usedCategories.has(id)) warn(`Category "${id}" is not used by any card.`);
  });

  warnings.forEach((w) => console.warn(`⚠ ${w}`));

  if (errors.length) {
    errors.forEach((e) => console.error(`✗ ${e}`));
    console.error(`\n${errors.length} error(s) found in data/cards.json.`);
    process.exit(1);
  }

  console.log(
    `✓ cards.json is valid — ${data.cards.length} cards, ${data.categories.length} categories` +
      (warnings.length ? `, ${warnings.length} warning(s).` : ".")
  );
}

main();
