# SourceRadar 📡

**China's bestsellers, before they hit TikTok.** A curated product-intelligence site for US/EU buyers sourcing viral Chinese products for resale.

## What makes it different from Alibaba.com

Research-backed positioning (full reports in [`docs/research/`](docs/research/), strategy in [`docs/STRATEGY.md`](docs/STRATEGY.md)):

| | Alibaba / Accio | Ad-spy tools (Minea, PipiAds…) | **SourceRadar** |
|---|---|---|---|
| Signal | 200M-listing catalog | Western ads (4–8 weeks late) | **China-first (Douyin/1688), 4–12 weeks early** |
| Pricing | Single listed price | None | **Three tiers: 1688 factory vs Alibaba vs retail** |
| Decision data | — | Ad counts | **Lifecycle grade, landed cost w/ 2026 tariffs, compliance passport, season window, risk notes** |

## Features

- **24 curated picks across 14 hot tracks**, organized in three tiers: profit picks (LED beauty devices, smart pet, AI toys, EU balcony solar), volume picks (CleanTok, drinkware, hair tools…), signature picks (mamian skirts, gongfu tea sets)
- **Three-tier price spread** on every card, plus the copy-pasteable **1688 Chinese search term**
- **Lifecycle honesty**: early window / growth / saturated grading
- **Landed-cost calculator** per product: EXW → tariff (2026 US rates) → freight → margin at target retail
- **Compliance passport**: US/EU cert lists (CE, FCC, FDA, EN71, UN38.3, GPSR responsible person) with difficulty grades
- **Policy watch strip**: de minimis elimination, EU €150 exemption sunset, GPSR
- Search (EN + 中文), track filters, sort by trend/spread/price/MOQ

## Run it

Static site, no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `index.html` in a browser.

## Structure

```
index.html    page shell & copy
styles.css    dark-theme styling
data.js       curated product dataset (the editorial core)
app.js        filtering, sorting, modal, landed-cost calculator
docs/         strategy brief + three research reports (Chinese)
```

Prices and tariff figures are indicative references — confirm HS-code rates with a licensed customs broker before ordering.
