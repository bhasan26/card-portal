/* Card Portal — pick the best-earning card for a spending category.
   Reads data/cards.json; all rendering is client-side. */
(function () {
  "use strict";

  var QUICK_CATEGORIES = ["amazon", "groceries", "dining", "gas", "travel", "everything-else"];
  var els = {};
  var DATA = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    els.select = document.getElementById("categorySelect");
    els.chips = document.getElementById("categoryChips");
    els.results = document.getElementById("results");
    els.offers = document.getElementById("offers");
    els.offersList = document.getElementById("offersList");
    els.offersCount = document.getElementById("offersCount");
    els.calendar = document.getElementById("calendar");
    els.grid = document.getElementById("cardGrid");
    els.themeToggle = document.getElementById("themeToggle");

    setupTheme();

    fetch("data/cards.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        DATA = data;
        buildControls();
        renderOffers();
        renderWallet();
        renderCalendar();
        // Restore last choice or default to the first category.
        var saved = safeGet("cp:lastCategory");
        var initial = saved && findCategory(saved) ? saved : DATA.categories[0].id;
        els.select.value = initial;
        selectCategory(initial);
      })
      .catch(function (err) {
        els.results.innerHTML =
          '<div class="error">Couldn\'t load card data (' +
          escapeHtml(err.message) +
          "). If you're opening this file directly, run it through a local server so <code>fetch</code> can read <code>data/cards.json</code>.</div>";
      });
  }

  /* ---------- Controls ---------- */

  function buildControls() {
    var frag = document.createDocumentFragment();
    DATA.categories.forEach(function (cat) {
      var opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.label;
      frag.appendChild(opt);
    });
    els.select.appendChild(frag);
    els.select.addEventListener("change", function () {
      selectCategory(els.select.value);
    });

    QUICK_CATEGORIES.forEach(function (id) {
      var cat = findCategory(id);
      if (!cat) return;
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = cat.label;
      chip.dataset.cat = id;
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", function () {
        els.select.value = id;
        selectCategory(id);
      });
      els.chips.appendChild(chip);
    });
  }

  function selectCategory(id) {
    safeSet("cp:lastCategory", id);
    Array.prototype.forEach.call(els.chips.children, function (chip) {
      chip.setAttribute("aria-pressed", String(chip.dataset.cat === id));
    });
    renderResults(id);
  }

  /* ---------- Ranking ---------- */

  // Returns the reward rate a card earns for a category, falling back to
  // "everything-else". Returns null if the card has no applicable rule.
  function rateFor(card, categoryId) {
    var direct = null;
    var fallback = null;
    card.rules.forEach(function (rule) {
      if (rule.category === categoryId) direct = rule;
      if (rule.category === "everything-else") fallback = rule;
    });
    var rule = direct || fallback;
    if (!rule) return null;
    return { rate: rule.rate, note: rule.note || "", matched: !!direct, unit: card.unit };
  }

  function rankCards(categoryId) {
    return DATA.cards
      .map(function (card) {
        return { card: card, result: rateFor(card, categoryId) };
      })
      .filter(function (x) {
        return x.result !== null;
      })
      .sort(function (a, b) {
        // Higher rate first; direct matches beat fallbacks on ties.
        if (b.result.rate !== a.result.rate) return b.result.rate - a.result.rate;
        if (a.result.matched !== b.result.matched) return a.result.matched ? -1 : 1;
        return a.card.name.localeCompare(b.card.name);
      });
  }

  /* ---------- Rendering ---------- */

  function renderResults(categoryId) {
    var cat = findCategory(categoryId);
    var ranked = rankCards(categoryId);
    els.results.innerHTML = "";

    if (!ranked.length) {
      els.results.innerHTML = '<div class="empty">No card in your wallet earns rewards on this category.</div>';
      return;
    }

    var top = ranked[0];
    els.results.appendChild(renderBestCard(top, cat));

    var rest = ranked.slice(1);
    if (rest.length) {
      var box = document.createElement("div");
      box.className = "ranking";
      box.innerHTML = '<p class="ranking__title">Other cards for ' + escapeHtml(cat.label) + "</p>";
      rest.forEach(function (x) {
        box.appendChild(renderRankRow(x));
      });
      els.results.appendChild(box);
    }
  }

  function renderBestCard(x, cat) {
    var card = x.card;
    var res = x.result;
    var wrap = document.createElement("div");
    wrap.className = "best-card";

    var head = document.createElement("div");
    head.className = "best-card__head";
    head.style.background = gradient(card);
    head.innerHTML =
      '<div class="best-card__swatch" style="background:' + escapeAttr(card.accent || card.color) + '"></div>' +
      '<div><div class="best-card__name">' + escapeHtml(card.name) + "</div>" +
      '<div class="best-card__issuer">' + escapeHtml(card.issuer) + "</div></div>" +
      '<span class="best-card__badge">Best pick</span>';

    var body = document.createElement("div");
    body.className = "best-card__body";
    var note = res.matched ? res.note : "Base rate — no special bonus for " + cat.label.toLowerCase() + ".";
    var cardOffers = offersForCard(card.id);
    var offerFlag = cardOffers.length
      ? '<div class="offer-flag">🎯 ' + cardOffers.length +
        " active offer" + (cardOffers.length > 1 ? "s" : "") + " on this card — see below</div>"
      : "";
    body.innerHTML =
      '<div class="best-card__rate">' + formatRate(res.rate, card.unit) +
      " <small>on " + escapeHtml(cat.label) + "</small></div>" +
      (note ? '<p class="best-card__note">' + escapeHtml(note) + "</p>" : "") +
      offerFlag +
      (card.offersUrl
        ? '<br><a class="best-card__link" href="' + escapeAttr(card.offersUrl) + '" target="_blank" rel="noopener">View card offers ↗</a>'
        : "");

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function renderRankRow(x) {
    var card = x.card;
    var res = x.result;
    var row = document.createElement("div");
    row.className = "rank-row";
    row.innerHTML =
      '<span class="rank-row__swatch" style="background:' + escapeAttr(card.color) + '"></span>' +
      '<div class="rank-row__name">' + escapeHtml(card.name) +
      (res.note && res.matched ? "<span>" + escapeHtml(res.note) + "</span>" : "") +
      "</div>" +
      '<div class="rank-row__rate">' + formatRate(res.rate, card.unit) +
      (card.unit === "miles" ? '<span class="badge-miles">miles</span>' : "") +
      "</div>";
    return row;
  }

  /* ---------- Offers ---------- */

  // Non-expired offers, soonest-expiring first. Expiry is evaluated at page
  // load, so lapsed offers vanish on their own without editing the data.
  function activeOffers() {
    var offers = Array.isArray(DATA.offers) ? DATA.offers : [];
    var today = startOfToday();
    return offers
      .filter(function (o) {
        var d = parseDate(o.expires);
        return d !== null && d >= today;
      })
      .sort(function (a, b) {
        return parseDate(a.expires) - parseDate(b.expires);
      });
  }

  function offersForCard(cardId) {
    return activeOffers().filter(function (o) {
      return o.card === cardId;
    });
  }

  function renderOffers() {
    var offers = activeOffers();
    if (!offers.length) {
      els.offers.hidden = true;
      return;
    }
    els.offersCount.textContent = offers.length;
    els.offersList.innerHTML = "";
    offers.forEach(function (o) {
      var card = cardById(o.card);
      var days = daysUntil(o.expires);
      var soon = days <= 7;
      var el = document.createElement("div");
      el.className = "offer";
      el.innerHTML =
        '<span class="offer__stripe" style="background:' +
        escapeAttr(card ? card.accent || card.color : "#888") + '"></span>' +
        '<div class="offer__body">' +
        '<div class="offer__card">' + escapeHtml(card ? card.name : o.card) + "</div>" +
        '<div class="offer__title">' + escapeHtml(o.title || "Offer") + "</div>" +
        (o.detail ? '<p class="offer__detail">' + escapeHtml(o.detail) + "</p>" : "") +
        '<div class="offer__foot">' +
        '<span class="offer__countdown' + (soon ? " is-soon" : "") + '">' + countdownLabel(days) + "</span>" +
        (o.url
          ? '<a class="offer__link" href="' + escapeAttr(o.url) + '" target="_blank" rel="noopener">Open ↗</a>'
          : "") +
        "</div></div>";
      els.offersList.appendChild(el);
    });
    els.offers.hidden = false;
  }

  function renderWallet() {
    var frag = document.createDocumentFragment();
    DATA.cards.forEach(function (card) {
      var el = document.createElement("div");
      el.className = "wallet-card";
      el.style.background = gradient(card);

      var topRules = card.rules
        .slice()
        .sort(function (a, b) {
          return b.rate - a.rate;
        })
        .slice(0, 3);

      var rulesHtml = topRules
        .map(function (rule) {
          return (
            '<div class="wallet-card__rule"><span>' +
            escapeHtml(categoryLabel(rule.category)) +
            "</span><b>" +
            formatRate(rule.rate, card.unit) +
            "</b></div>"
          );
        })
        .join("");

      var offerCount = offersForCard(card.id).length;
      var offerBadge = offerCount
        ? '<span class="wallet-card__offer-badge">🎯 ' + offerCount + " offer" + (offerCount > 1 ? "s" : "") + "</span>"
        : "";
      el.innerHTML =
        '<div class="wallet-card__top">' +
        '<div><div class="wallet-card__name">' + escapeHtml(card.name) + "</div>" +
        '<div class="wallet-card__issuer">' + escapeHtml(card.issuer) + "</div></div>" +
        '<span class="wallet-card__unit">' + (card.unit === "miles" ? "Miles" : "Cash") + "</span>" +
        "</div>" +
        '<div class="wallet-card__rules">' + rulesHtml + "</div>" +
        offerBadge;
      frag.appendChild(el);
    });
    els.grid.innerHTML = "";
    els.grid.appendChild(frag);
  }

  function renderCalendar() {
    var cal = DATA.discoverCalendar;
    if (!cal) return;
    var years = Object.keys(cal).filter(function (k) {
      return /^\d{4}$/.test(k);
    });
    if (!years.length) return;
    var year = years.sort().reverse()[0];
    var quarters = cal[year];
    var nowQ = currentQuarter(year);

    var html =
      "<h2>Discover rotating 5% — " + escapeHtml(year) + "</h2>" +
      '<p class="calendar__note">' + escapeHtml(cal._note || "Activate each quarter to earn 5%.") + "</p>" +
      '<div class="quarters">';

    ["Q1", "Q2", "Q3", "Q4"].forEach(function (q) {
      var data = quarters[q];
      if (!data) return;
      var isNow = q === nowQ;
      html +=
        '<div class="quarter' + (isNow ? " is-now" : "") + '">' +
        '<div class="quarter__q">' + q + (isNow ? '<span class="quarter__now">Now</span>' : "") + "</div>" +
        '<div class="quarter__months">' + escapeHtml(data.months || "") + "</div>" +
        '<ul class="quarter__cats">' +
        (data.categories || [])
          .map(function (c) {
            return "<li>" + escapeHtml(c) + "</li>";
          })
          .join("") +
        "</ul></div>";
    });
    html += "</div>";
    els.calendar.innerHTML = html;
    els.calendar.hidden = false;
  }

  /* ---------- Theme ---------- */

  function setupTheme() {
    var saved = safeGet("cp:theme");
    if (saved === "dark" || saved === "light") {
      document.documentElement.setAttribute("data-theme", saved);
    }
    updateToggleIcon();
    els.themeToggle.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      if (!current) {
        current = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      var next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      safeSet("cp:theme", next);
      updateToggleIcon();
    });
  }

  function updateToggleIcon() {
    var current = document.documentElement.getAttribute("data-theme");
    var isDark = current
      ? current === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var icon = els.themeToggle.querySelector(".theme-toggle__icon");
    if (icon) icon.textContent = isDark ? "☀️" : "🌙";
  }

  /* ---------- Helpers ---------- */

  function findCategory(id) {
    return DATA.categories.filter(function (c) {
      return c.id === id;
    })[0];
  }
  function cardById(id) {
    return DATA.cards.filter(function (c) {
      return c.id === id;
    })[0];
  }
  function startOfToday() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  // Parse a YYYY-MM-DD string into a local Date (midnight). Returns null if invalid.
  function parseDate(s) {
    if (typeof s !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  function daysUntil(s) {
    var d = parseDate(s);
    if (!d) return 0;
    return Math.round((d - startOfToday()) / 86400000);
  }
  function countdownLabel(days) {
    if (days <= 0) return "Ends today";
    if (days === 1) return "1 day left";
    if (days <= 45) return days + " days left";
    return "Ends " + new Date(startOfToday().getTime() + days * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function categoryLabel(id) {
    var c = findCategory(id);
    return c ? c.label : id;
  }
  function formatRate(rate, unit) {
    if (unit === "miles") return rate + "×";
    return rate + "%";
  }
  function gradient(card) {
    var c = card.color || "#333";
    var a = card.accent || card.color || "#555";
    return "linear-gradient(135deg, " + c + ", " + a + ")";
  }
  function currentQuarter(year) {
    var now = new Date();
    if (String(now.getFullYear()) !== String(year)) return null;
    return "Q" + (Math.floor(now.getMonth() / 3) + 1);
  }
  function safeGet(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function safeSet(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) {}
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }
})();
