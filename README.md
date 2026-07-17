# 💳 Card Portal

Tells you which of your credit cards earns the most for whatever you're about to buy.
Pick a category → see the best card, the runners-up, active offers, and the Discover rotating calendar.

**Live:** https://bhasan26.github.io/card-portal/

Static site — no build step, no backend. All data lives in one JSON file.

## Edit your cards and offers

Everything comes from [`data/cards.json`](data/cards.json):

- **`cards`** — your wallet and each card's reward rules (base rates change rarely).
- **`offers`** — limited-time deals you spot in the Amex/Chase apps. Add a line and it shows up with a countdown; it **auto-hides after `expires`** — no cleanup needed.

```json
{
  "card": "chase-freedom-unlimited",
  "title": "5% back at a select grocery store",
  "expires": "2026-09-30",
  "url": "https://www.chase.com/personal/credit-cards/chase-offers"
}
```

- **`discoverCalendar`** — the quarterly rotating 5% categories; the current quarter auto-highlights.

## How it stays current

| Piece | How it updates |
|-------|----------------|
| Offer countdowns / expiry | Automatic — evaluated in the browser on every visit |
| Current-quarter highlight | Automatic |
| New offers, base rates, next quarter's categories | You edit `cards.json` (personalized offers have no public feed) |
| Reminders | A weekly [workflow](.github/workflows/refresh.yml) opens a GitHub issue when an offer is expiring or the calendar needs the new quarter |

## Develop

```bash
python3 -m http.server 8000     # then open http://localhost:8000
node scripts/validate-cards.mjs # checks the data before you commit
```

Every push runs validation and deploys to GitHub Pages via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

> Card programs change often and targeted offers are personal to your account — always verify on the issuer's site before relying on a rate.
