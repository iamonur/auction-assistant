# Auction Assistant (WoW addon)

In-game companion to the **Crafting & Auction Assistant** desktop app. Shows the app's last-synced item prices on item tooltips, zone values on the world map, mob and skinning values on unit tooltips, and gathering node values on herb/ore tooltips — and can scan your realm's Auction House on request, feeding real, current prices back into the desktop app ahead of its TSM/Battle.net data.

## How it's paired with the desktop app

WoW addons can't open network sockets or read/write arbitrary files — the only channel between this addon and the desktop app is **SavedVariables**, a Lua table the game writes to disk on logout and reads back on login. So the sync is one-way and asynchronous, not live:

1. In the desktop app, go to **Settings → WoW Addon Sync**, point it at your WoW installation folder (the one directly containing `Interface/` and `WTF/`), and click **Export Prices to Addon**.
2. This writes a price snapshot into this addon's SavedVariables file. WoW must be **fully closed** when you do this — if it's open, the client can overwrite the export with its own in-memory copy the next time you log out.
3. Log into WoW. The addon loads the snapshot and starts showing prices on tooltips.

Anything shown in-game reflects prices *as of your last export*, refreshed on your next full relogin — never live. That's not a corner we cut; it's the actual ceiling of what a legitimate WoW addon can do.

## Installation

Copy this whole `AuctionAssistant/` folder into your WoW installation's `Interface/AddOns/` folder, for whichever flavor(s) you play:

- Retail: `_retail_/Interface/AddOns/`
- Classic Era: `_classic_era_/Interface/AddOns/`
- Classic Progression (currently Mists of Pandaria Classic): `_classic_/Interface/AddOns/`

One folder works across all three — see the three `.toc` files (`AuctionAssistant.toc`, `_Vanilla.toc`, `_Mists.toc`); WoW picks the one matching the client it's running.

**Copy, don't move**: on macOS, dragging this folder into your AddOns folder in Finder *moves* it (same-volume drags default to move, not copy) rather than leaving a copy behind in this repo. Hold ⌥ Option while dragging to copy instead, or use `cp -r` from a terminal. This has already happened twice this session — if the `AuctionAssistant/` folder ever goes missing from `wow-addon/`, that's almost certainly why.

## Slash commands

- `/auctionassistant` or `/aa` — prints how many item prices, zone values, mob values, skinning values, and gathering nodes are loaded and how recent the last export was.
- `/aa zones` — lists a sample of the zone entries actually stored (display name + normalized lookup key), for comparing directly against what `/aamapdebug` resolves live in-game.
- `/aascan` — starts a full Auction House scan. Requires the Auction House window to already be open. (There's also a "Scan AH" button next to the Auction House window itself — see below.)
- `/aamapdebug` — toggles diagnostic chat output for the Zone Value map overlay (see below). Off by default; only useful while actively chasing a map-hover bug.

## Zone Value world map overlay

Open the world map — a continent overview or a single zone, either works — and hover anywhere on it. If the app has data for whatever zone is under your cursor, a tooltip follows the mouse showing that zone's name and its average Expected Value across the mobs tracked there.

Resolving "what zone is under the cursor" takes two steps, both real Blizzard mechanisms — the same ones the default UI's own zone-name-on-hover uses (`Blizzard_SharedMapDataProviders/AreaLabelDataProvider.lua`): `C_Map.GetMapInfoAtPosition(uiMapID, x, y)` first, and if that just hands back the same map you're already viewing, `MapUtil.FindBestAreaNameAtMouse(uiMapID, x, y)` as a fallback.

**Status: resolution confirmed working; the name MATCH against the app's data is not.** Three rounds of live-client fixes got the resolution mechanism itself working correctly — both continent-level and zone-level hover now resolve to a real zone name. But `/aamapdebug` shows that resolved name never matches any of the 83+ real zone entries the addon has loaded, on every zone tested. That's now a data/normalization mismatch between the live-resolved name and the exported name, not a resolution bug.

Resolution history, in order:

1. Called only `GetMapInfoAtPosition`. Result: showed nothing on sub-zones, only ever the continent's own info back.
2. Added the `MapUtil.FindBestAreaNameAtMouse` fallback, and passed `true` as `GetMapInfoAtPosition`'s 4th argument (`ignoreZoneMapPositionData`), matching Blizzard's own click-to-navigate handler (`MapCanvasMixin:NavigateToCursor`). Result: **worse** — continent-view hover broke for most continents, only Pandaria/Outland kept working.
3. Reverted the 4th argument. Result: continent-level hover confirmed working again, and zone-level hover confirmed resolving to a real name — but never matching (this version's starting point, and where the fix now needs to focus).

To chase the match failure: run `/aamapdebug`, hover a zone, note the resolved name + key it prints, then run `/aa zones` and compare against the stored list directly — same account, same session, no manual transcription needed. See `ZoneHover.lua`'s own comments for the full history.

Matching against the app's data is done by that zone's live display name, normalized the same way on both the export side (`main/addon/displayName.ts`) and the addon side (`Core.lua`'s `NormalizeDisplayName`) — there's no shared id space between the app's world-database map ids and WoW's own UiMapID system, so name matching sidesteps needing a translation table between the two.

## Mob Value and skinning tooltips

Mouse over any NPC in the game world (not on the map — the actual mob, tooltip on mouseover like any other unit) and, if the app has data for it, its tooltip gets an extra line with its average Expected Value — the same per-kill loot + gold value shown in the desktop app's Mob Value tab. Matched by creature template id (parsed out of `UnitGUID`), not by name, since many distinct creatures legitimately share a display name.

A dead, skinnable corpse also gets a second, separate line for its skinning value (only once it's actually dead — a live mob isn't skinnable yet). This is deliberately kept apart from the general Expected Value line: skinning is an optional action the player may or may not take, not part of what killing the mob is worth, so folding it into the same number would quietly change what "Expected Value" means everywhere else it's shown (Zone Value averages, Dungeon Selecting totals, ...). See `MobTooltip.lua`.

## Gathering node tooltips

Mouse over a herb or mining node in the world and, if the app has data for it, its tooltip gets an extra line with the current price of whatever it yields.

Gathering nodes are neither units nor items — they're GameObjects, a third tooltip category with its own hook, so this needed its own file, and one genuinely different implementation per client family (this is the second addon feature, after AH scanning, that does):

- **Retail** (`GatherTooltip_Retail.lua`): uses the modern `TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Object, ...)` hook, reading the node's name straight out of the tooltip data Blizzard already built.
- **Classic Era / MoP Classic** (`GatherTooltip_Legacy.lua`): does *not* use `TooltipDataProcessor` even though the function exists on these clients — confirmed against real, current addon code that Cata-family Classic clients have the API present but don't actually route GameObject tooltips through it. Instead this hooks `GameTooltip`'s `OnShow`, rules out every other tooltip type (unit, item, spell), and reads the tooltip's title `FontString` directly.

Both match by the node's plain display name (e.g. "Copper Vein", "Peacebloom"), the same way `ZoneHover.lua` matches zones — normalized and looked up in `AuctionAssistantPrices.gatheringNodes`. The desktop app already resolves which item a given node name yields at import time (`gathering_node_spawns` in its database, sourced from the world database along with each node's real in-game name), so the addon never has to guess at that mapping itself — it just needs the exact name text, which is what both hooks above are built to get reliably.

**Note on verification**: grounded in real, current reference implementations (`kemayo/wow-objectscanner`, and Blizzard's own generated API annotations, which is how the `Enum.TooltipDataType.Object` vs `.GameObject` naming mistake in an earlier draft got caught before it ever shipped). The `GatherTooltip_Legacy.lua` path — Classic Era and MoP Classic — is confirmed working in a live client, herb and mining nodes both. `GatherTooltip_Retail.lua`'s `TooltipDataProcessor` path hasn't been tested live yet.

## Auction House scanning

Open the Auction House. A **"Scan AH"** button appears just outside the window (to its right) — click it, or run `/aascan` instead if you prefer. This is the one feature that genuinely needs different code per client, but the split is **not** Classic-vs-Retail — it's legacy-AH-vs-modern-AH, and Blizzard retrofitted the modern Auction House onto Classic progression realms starting with Cataclysm Classic, so MoP Classic already inherited it:

- **Retail and MoP Classic** (`AHScan_ModernAH.lua`): calls `C_AuctionHouse.ReplicateItems()` — a full realm-wide auction replication, the modern-AH's direct equivalent of the legacy scanner's GetAll query.
- **Classic Era only** (`AHScan_Legacy.lua`): still runs the older `QueryAuctionItems`/`GetAuctionItemInfo` API. Uses a "GetAll" query — one request that returns every auction in a single batch. The server only allows a GetAll query roughly once every 15 minutes; if that window isn't open yet, the addon says so rather than falling back to a much slower page-by-page scan.

**Confirmed working end to end**, after three real bugs found and fixed through live-client testing:

1. A `.toc`/API-family assignment mistake — MoP Classic was pointed at the legacy file, whose `AuctionFrame` doesn't exist there (the scan button never appeared).
2. A wrong-API mistake — browsing by category (`SendBrowseQuery`, Auctionator's mechanism for interactive keyword search) instead of replicating everything (`ReplicateItems`, the actual full-scan mechanism). The scan "succeeded" but always found 0 items.
3. A wire-format mismatch — the scan wrote each item as `{price = ..., quantity = ...}`, but the desktop app's importer reads the short keys `{p = ..., v = ...}` that every other part of this addon's exports already use. The scan looked successful in-game (correct item counts printed to chat) while the import silently found nothing usable, because the two sides were never actually tested against each other's real output.

Confirmed against Auctionator's own real, current `.toc`, which groups its modern-AH source under `[AllowLoadGameType cata, mists, mainline]` and its legacy-AH source under `[AllowLoadGameType vanilla, tbc, wrath]` — this addon now follows the exact same split.

The button is greyed out and reads "Scanning..." for the duration of the scan — a few seconds either way, since both `ReplicateItems()` and the legacy GetAll query return everything in one batch rather than paging.

Either way, the result gets written to a separate SavedVariables global (`AuctionAssistantScan`) — same file the price export uses, just written by the addon instead of the app. A scan only exists in memory until WoW **saves** SavedVariables to disk, so **as soon as a scan finishes, the addon calls `ReloadUI()` itself** (after a short delay so you can read the completion message) — you don't need to remember to `/reload` or log out manually. This does close the Auction House window as a side effect of the reload; that's expected. Unlike the price-export direction, none of this needs WoW fully closed: nothing else in the client ever touches `AuctionAssistantScan` again after the reload, so there's no risk of a later save clobbering it the way there is for exports. Back in the desktop app, **Settings → WoW Addon Sync → Import AH Scan from Addon** picks it up right away and stores it separately from TSM/Battle.net data. A scan under 24 hours old is preferred everywhere in the app; older data falls back to whichever of TSM/Battle.net is configured.

**Never automated or unattended**: scanning only ever starts from a click on the button or `/aascan` typed by the player, and only while the Auction House window is already open — matching how Auctionator and TSM's own scanning tools work. The automatic `ReloadUI()` afterward is just a save, not another scan — it doesn't requery the AH or repeat anything. Nothing in this addon queries the AH on its own or on a timer.

## Roadmap

- [x] Item tooltip prices
- [ ] Zone Value world map overlay — position resolution confirmed working; the name match against the app's own zone data is not (see above)
- [x] Mob Value and skinning-value unit tooltips
- [x] Auction House scanning, main pricing source with TSM/Battle.net as fallback — confirmed working end to end
- [x] Gathering node tooltips

## License

Part of the [Crafting & Auction Assistant](../../README.md) repository; see the root [LICENSE](../../LICENSE) (GPL-3.0). Unlike the desktop app's bundled game data, nothing in this addon is derived from third-party GPL sources — it's original code that happens to live in the same GPL-3.0 repo.
