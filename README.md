# WoW Classic Crafting & Auction Assistant

A desktop app (Electron + React + TypeScript) for market tracking, crafting profitability, gathering, farming, and mob/zone value analysis across **WoW Classic Era**, **Classic Progression**, and **Retail** — each with its own local database.

> Unofficial, fan-made tool. Not affiliated with or endorsed by Blizzard Entertainment. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for data source attribution and licensing.

## Features

- **Crafting Sniper** — profession-by-profession recipe profitability (craft cost vs. AH sale price, ROI%), with a liquidity signal so illiquid/stale prices are visibly greyed out rather than silently trusted.
- **Gathering Profitability** — herbalism/mining/skinning/fishing unit prices, 7-day trend, and price history sparkline.
- **Battle Pet Farming** — caged pet prices from TSM's pet data feed.
- **Farming Route Helper** — known farming spots for a chosen item (zone, drop/gather chance, estimated yield/hour).
- **Investment & Market Anomalies** — flags items trading well below their 30-day average (potential flips), with a BoE-only filter.
- **Dungeon Selecting** — build your own expected-value model for a dungeon run from its loot table, with drop-chance suggestions pulled from real mob data.
- **Mob Value** — Expected Value per mob (drop-table value × chance, plus average gold), filterable by rank (Normal/Elite/Rare Elite/Boss), with a click-through drop table popup per mob.
- **Zone Value** — average mob Expected Value per zone/instance, filterable by Open World / Dungeon / Raid.
- **Item detail popup** — click any item anywhere in the app to see who drops it, where it's gathered, and what recipes use or produce it.

Two pricing sources, switchable per game version in Settings:
- **Battle.net API** (official) — you supply your own client ID/secret.
- **TSM public data** (free, no API key) — TradeSkillMaster's crowd-sourced pricing feed.

## Getting started

```bash
npm install
npm run dev          # launch in dev mode with hot reload
```

```bash
npm run build         # typecheck + production build
npm run package        # build + package as a distributable (electron-builder)
```

Requires Node.js and npm. On first launch, choose a game version and pricing source in Settings, then hit **Sync AH Data**.

## Architecture

- **Electron** main process (`src/main`) owns a `better-sqlite3` database per game version (retail / classic_era / classic_progression) and all IPC handlers.
- **React 18 + TypeScript + Tailwind** renderer (`src/renderer`), routed with `react-router-dom`.
- **Preload** (`src/preload`) exposes a typed `window.api` surface via `contextBridge` — sandboxed, no direct Node access from the renderer.
- Mob/loot/gathering/zone reference data is bundled at build time — `resources/mop-import/*.json.gz` for Classic Progression, `resources/classic-import/*.json.gz` for Classic Era — each derived from an open-source WoW server core's world database — see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for provenance and the extraction scripts.
- Classic recipe data (`resources/classic-recipes/*.json`) comes from the MIT-licensed LibCrafts-1.0 addon library.

## License

[GNU General Public License v3.0](./LICENSE) — chosen because the bundled mob/loot/zone reference data is derived from a GPL-3.0 world database; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the full explanation and all third-party attributions.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
