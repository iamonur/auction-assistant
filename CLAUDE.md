# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A desktop app (Electron + React + TypeScript) for market tracking, crafting profitability, gathering, farming, and mob/zone value analysis across WoW Classic Era, Classic Progression, and Retail — each with its own local database. A companion in-game addon (`wow-addon/AuctionAssistant/`, Lua) provides in-game tooltips and AH scanning that sync with the desktop app one-way at a time through WoW's SavedVariables files.

Two pricing sources: the Battle.net Game Data & Auction House API (official, user supplies their own client ID/secret) and TSM's free public-data feed.

## Commands

```bash
npm install          # also runs postinstall → electron-builder install-app-deps (rebuilds better-sqlite3 for Electron's Node ABI)
npm run dev           # electron-vite dev, hot reload
npm run build         # typecheck (both tsconfigs) + electron-vite production build
npm run typecheck     # tsc --noEmit against tsconfig.node.json and tsconfig.web.json
npm run lint          # eslint . --ext .ts,.tsx
npm test              # full vitest run
npm run test:watch    # vitest watch mode
npm run package       # build + electron-builder distributable
```

Run a single test file or a name pattern by passing args through to vitest:

```bash
npm test -- src/main/queries/zoneValue
npm test -- -t 'flags the five continent-name rows'
```

`test`/`test:watch` are wrapped as `cross-env ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run` — not plain `vitest` — because `better-sqlite3`'s native binding is compiled against Electron's Node ABI, not the system Node. Running vitest directly will load a binding built for the wrong ABI and crash.

## Architecture

### Process split and the typed IPC contract

Standard Electron three-process split, but the IPC surface is fully typed end-to-end through one shared contract, spread across four files that must all be read together to understand a single call:

- `src/shared/ipcChannels.ts` — the `IPC` object of channel-name string constants.
- `src/shared/types.ts` — the request/response types for each channel.
- `src/main/ipc.ts` — `registerIpcHandlers()`, called once from `main/index.ts`, wires every `ipcMain.handle(IPC.X, ...)` to a query/sync function. Every handler funnels through two helpers, `activeDb()` and `activeSettings()`, which read whatever game version is currently active (`main/store.ts`) — this is the only place "current game version" is resolved for query purposes.
- `src/preload/index.ts` — mirrors every channel as a typed method on `window.api.<namespace>.<method>()`, exposed via `contextBridge.exposeInMainWorld`. The renderer never touches `ipcRenderer` directly.

The preload build is forced to CommonJS (`electron.vite.config.ts`) because a sandboxed `BrowserWindow` (`webPreferences.sandbox: true`) can only execute CJS preload scripts.

When adding an IPC call, all four files change together: channel constant → shared types → main handler → preload method.

### Per-game-version SQLite databases

`src/main/db/index.ts`'s `getDb(gameVersion)` opens one `better-sqlite3` file per `GameVersion` (`retail` / `classic_era` / `classic_progression`) at `app.getPath('userData')/market-assistant-<suffix>.sqlite3`. Item ids, recipes, and prices from one WoW product are meaningless or actively wrong applied to another, so they never share a database or connection. Switching the active version (`GAME_VERSION_SET`) closes the current connection and lazily opens/creates the target's file.

On open, `getDb` runs schema + seed, then conditionally imports recipes/world data:

```
classic_era, classic_progression → importClassicRecipes
classic_progression              → importWorldData(db, 'mop-import')
classic_era                      → importWorldData(db, 'classic-import')
```

**`importWorldData` only runs once, ever, per database file** — it's gated on `gathering_node_spawns` being empty. There is no re-import mechanism. If the bundled resource data in `resources/mop-import/` or `resources/classic-import/` changes (a pipeline fix, new enrichment), any database that already has rows will never pick it up — the only way to force a re-sync is deleting the relevant tables directly in the user's SQLite file. This has caused real data-completeness bugs; if you touch the import pipeline, flag this to whoever's testing it.

### Bundled world data and its known coverage gap

`resources/mop-import/*.json.gz` (SkyFire_548, MoP 5.4.8) and `resources/classic-import/*.json.gz` (cmangos/classic-db) are transformed extracts of GPL-3.0 emulator world databases — mob catalog, loot, gathering/skinning spawns, zone data. Both are GPL-3.0, which is why the whole project is licensed GPL-3.0 (see `THIRD_PARTY_NOTICES.md`).

Open-world sub-zone names (e.g. "Elwynn Forest" instead of continent-level "Eastern Kingdoms") are cross-referenced from pfQuest (MIT), which only covers Vanilla and TBC content. Creatures from Wrath/Cataclysm/MoP content — or anything pfQuest doesn't track — fall back to a hardcoded continent-level name (`CONTINENTS` map in `scripts/data-extraction/extract-mob-zones.js`: Eastern Kingdoms, Kalimdor, Outland, Northrend, Pandaria). `ZoneValueRow.isContinentFallback` (computed in `src/main/queries/zoneValue.ts` against a fixed 5-name set) flags these rows so callers can distinguish a real farmable zone from a whole-continent average; the desktop UI hides them by default behind a "Show continent-wide rows" toggle.

### The addon and its sync boundary

`wow-addon/AuctionAssistant/` is a separate Lua codebase with no build step, versioned alongside the app but not compiled or bundled by it. It talks to the desktop app only through WoW's SavedVariables mechanism — there is no socket, no shared process:

- **Desktop → addon**: `src/main/addon/export.ts` writes prices/zone values/mob values/skinning values/gathering-node values directly into each WoW account's `WTF/Account/<account>/SavedVariables/AuctionAssistant.lua` as the `AuctionAssistantPrices` table, via `src/main/addon/luaSerializer.ts`. This is best-effort: WoW only flushes SavedVariables to disk at logout, so exporting while the client is running risks it overwriting the export with its stale in-memory copy on next logout (`isWowLikelyRunning()` warns but doesn't block).
- **Addon → desktop**: `src/main/addon/ahScanImport.ts` reads the same account's `AuctionAssistantScan` table back via `src/main/addon/luaParser.ts`, after the addon's own `ReloadUI()` call flushes it (no full logout needed for this direction). It picks whichever account folder was written most recently.
- Both directions key items by numeric item id, but zones (`ZoneHover.lua`) and gathering nodes (`GatherTooltip_*.lua`) are keyed by `normalizeDisplayName(name)` (`src/main/addon/displayName.ts`) since there's no shared id space between this app's world-database zone names and WoW's own `C_Map`/`UiMapID` system or tooltip text.
- The scan payload's field names (`p`/`v`) are a load-bearing contract between `AHScan_Legacy.lua`/`AHScan_ModernAH.lua` and `ahScanImport.ts`'s `RawScanItem` — nothing tests the two sides against each other's real output, so a rename on either side must be grepped for on the other.
- **AH scanning API split is not Classic-vs-Retail.** Blizzard retrofitted the modern `C_AuctionHouse` API onto Cata Classic onward, so MoP Classic Progression uses `AHScan_ModernAH.lua` (same as Retail), and only true Classic Era uses `AHScan_Legacy.lua`. Check a `.toc`'s `AHScan_*` include before assuming otherwise.

### Path aliases

`@main` (main process only), `@shared` (all three processes), `@renderer` (renderer + vitest only), `@test` (vitest only). Defined identically in `electron.vite.config.ts`, `vitest.config.ts`, and `tsconfig.node.json`/`tsconfig.web.json` — if you add or change one, update all of them or the type-checker and bundler will disagree about what resolves.

### Game-version-specific external API quirks

`src/shared/gameVersions.ts` documents two independent, non-obvious naming schemes that must not be conflated: Battle.net's namespace infix (`classic1x` for Classic Era, `classic` for Progression, confirmed against Blizzard's actual namespace scheme) and TSM's public-data URL slug (`classic` for Classic Era, `classic-progression` for Progression) — verified empirically by fetching real data, not assumed from the Battle.net convention.
