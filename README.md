# WoW Classic Crafting & Auction Assistant

[![CI](https://github.com/iamonur/auction-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/iamonur/auction-assistant/actions/workflows/ci.yml)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](./LICENSE)

A desktop app (Electron + React + TypeScript) for market tracking, crafting profitability, gathering, farming, and mob/zone value analysis across **WoW Classic Era**, **Classic Progression**, and **Retail** — each with its own local database. Pairs with an optional in-game addon that brings those same prices onto item/mob/zone tooltips and can scan the Auction House for you.

> Unofficial, fan-made tool. Not affiliated with or endorsed by Blizzard Entertainment. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for data source attribution and licensing.

## Contents

- [Features](#features)
- [Companion in-game addon](#companion-in-game-addon)
- [Getting started](#getting-started)
- [Architecture](#architecture)
- [License](#license)
- [Contributing](#contributing)

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
- A third source layers on top of either once the addon is installed: a live **in-game AH scan**, preferred over both when it's under 24 hours old.

## Companion in-game addon

`wow-addon/AuctionAssistant/` is an optional WoW addon that brings the desktop app's data into the game client and can feed data back:

- **Item tooltips** show the app's last-synced price.
- **World map hover** shows a zone's average mob Expected Value.
- **Mob tooltips** show Expected Value per kill, plus a separate skinning value on a dead, skinnable corpse.
- **Gathering node tooltips** (herbs, mining) show the current price of what the node yields.
- **Auction House scanning** — a "Scan AH" button (or `/aascan`) next to the AH window replicates every current auction on your realm, no Battle.net API key needed. Imported back into the desktop app, a recent scan takes priority over TSM/Battle.net.

Since a WoW addon can't open a socket or read arbitrary files, syncing between the two only happens through **SavedVariables** — a Lua table the game writes on logout and reads on login, so it's one-way and asynchronous in each direction rather than live:

1. **Desktop → addon**: Settings → WoW Addon Sync → point it at your WoW installation folder → **Export Prices to Addon**. WoW must be fully closed first, or the running client can overwrite the export with its own stale copy on its next logout.
2. **Addon → desktop**: run a scan in-game (the addon reloads the UI itself afterward to flush the save — no manual `/reload` needed), then in the desktop app, Settings → WoW Addon Sync → **Import AH Scan from Addon**.

Install by copying the whole `AuctionAssistant/` folder into `Interface/AddOns/` under whichever client(s) you play (`_retail_`, `_classic_era_`, `_classic_`) — one folder works across all three via its three `.toc` files. Full details, slash commands (`/aa`, `/aascan`, `/aamapdebug`, ...), and the current status of each feature: [`wow-addon/AuctionAssistant/README.md`](./wow-addon/AuctionAssistant/README.md).

## Getting started

```bash
npm install
npm run dev          # launch in dev mode with hot reload
```

```bash
npm run build         # typecheck + production build
npm run package        # build + package as a distributable (electron-builder)
```

Requires Node.js and npm. Builds and tests run on macOS, Windows, and Linux (see `.github/workflows/`). On first launch, choose a game version and pricing source in Settings, then hit **Sync AH Data**. The addon above is optional and installed separately, in-game.

## Architecture

- **Electron** main process (`src/main`) owns a `better-sqlite3` database per game version (retail / classic_era / classic_progression) and all IPC handlers.
- **React 18 + TypeScript + Tailwind** renderer (`src/renderer`), routed with `react-router-dom`.
- **Preload** (`src/preload`) exposes a typed `window.api` surface via `contextBridge` — sandboxed, no direct Node access from the renderer.
- Mob/loot/gathering/zone reference data is bundled at build time — `resources/mop-import/*.json.gz` for Classic Progression, `resources/classic-import/*.json.gz` for Classic Era — each derived from an open-source WoW server core's world database — see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for provenance and the extraction scripts.
- Classic recipe data (`resources/classic-recipes/*.json`) comes from the MIT-licensed LibCrafts-1.0 addon library.
- `wow-addon/AuctionAssistant/` (Lua) is a separate, unbundled codebase that talks to the app only via WoW's SavedVariables files — see the addon section above.

Contributors and anyone using Claude Code in this repo: [`CLAUDE.md`](./CLAUDE.md) has a deeper architecture walkthrough (the typed IPC contract, the per-game-version database gotchas, the addon sync internals).

## License

[GNU General Public License v3.0](./LICENSE) — chosen because the bundled mob/loot/zone reference data is derived from a GPL-3.0 world database; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the full explanation and all third-party attributions.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
