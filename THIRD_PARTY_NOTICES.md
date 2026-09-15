# Third-Party Data & Code

This project is licensed under the **GNU General Public License v3.0** (see [LICENSE](./LICENSE)) primarily *because* of the first item below — combining GPL-licensed game data into a closed-source product isn't an option, so the whole app is GPL-3.0 to stay compliant.

## Game data sources

### SkyFire_548 world database — GPL-3.0

<https://github.com/ProjectSkyfire/SkyFire_548>

Mob catalog, loot tables, drop chances, gathering node spawns, skinning drops, and zone/instance data (`resources/mop-import/*.json.gz`) are derived from SkyFire_548's world database SQL dump (a Mists of Pandaria 5.4.8 emulator core, GPL-3.0 licensed). The dump itself is not redistributed here — only a compact, transformed JSON extract of the fields this app actually uses (creature stats, loot chances, zone names). The extraction script for the zone/instance data is included at [`scripts/data-extraction/extract-mob-zones.js`](./scripts/data-extraction/extract-mob-zones.js) so the transformation is reproducible and auditable, per GPL-3.0's source-availability requirements. (The scripts used to build the original `mobs.json.gz`, `gathering-nodes.json`, and `skinning-drops.json` extracts predate this repository's history and weren't preserved — anyone needing to regenerate those should write an equivalent extractor against the same SkyFire_548 SQL dump using the same `creature`/`creature_loot_template`/`gameobject`-family tables; the extraction pattern in `extract-mob-zones.js` is a reasonable template.)

### cmangos/classic-db — GPL-3.0

<https://github.com/cmangos/classic-db>

Mob catalog, loot tables, gathering node spawns, skinning drops, and zone/instance data for the **Classic Era** (1.12.1 vanilla) game version (`resources/classic-import/*.json.gz`) are derived from cmangos/classic-db, a content database for the MaNGOS-Classic emulator (mangos-classic itself is GPL-2.0-or-later; this companion database repository is directly GPL-3.0, so no license-compatibility question either way). Same treatment as the SkyFire data above — only a transformed JSON extract is bundled, not the source database.

### pfQuest — MIT

<https://github.com/shagu/pfQuest>

Open-world sub-zone names in both game versions' `mob-zones.json.gz` (e.g. "Elwynn Forest" instead of the continent-level "Eastern Kingdoms") are cross-referenced from pfQuest's creature-location database, an MIT-licensed Vanilla/TBC quest-helper addon. Only covers Vanilla and TBC content — creatures unique to later expansions, or any creature pfQuest doesn't track, keep their continent-level name as a fallback rather than an invented one. The enrichment script used for the MoP-import data is included at [`scripts/data-extraction/enrich-open-world-zones.js`](./scripts/data-extraction/enrich-open-world-zones.js); the Classic Era extraction applies the same pfQuest cross-reference inline as part of building `mob-zones.json.gz` directly.

### LibCrafts-1.0 — MIT

<https://github.com/refaim/LibCrafts-1.0>

Classic (1.12.1) crafting recipe data (`resources/classic-recipes/*.json`) is derived from LibCrafts-1.0, an MIT-licensed World of Warcraft addon library.

```
MIT License

Copyright (c) LibCrafts-1.0 contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Live data services (not redistributed — fetched at runtime by the user's own app instance)

### TradeSkillMaster public data feed

<https://www.tradeskillmaster.com/public-data>

Crafting Sniper, Battle Pet Farming, and the Mob/Zone Value pricing all optionally pull from TSM's free, unauthenticated crowd-sourced pricing CSVs at runtime. No TSM data is bundled with or redistributed by this repository — each user's running instance fetches current prices directly from TSM's servers. Use of this feed is subject to TSM's own terms; see their site for details.

### Battle.net Game Data & Auction House API

<https://develop.battle.net/documentation>

The alternative (official) pricing source. Each user supplies their own Battle.net API client ID/secret (via Settings, stored locally in their own `electron-store` config — never bundled, committed, or transmitted anywhere by this project) and queries Blizzard's API directly. Use is subject to Blizzard's API Terms of Use.

## Trademark disclaimer

*World of Warcraft* and *Blizzard Entertainment* are trademarks or registered trademarks of Blizzard Entertainment, Inc. This is an unofficial, fan-made tool and is not affiliated with, endorsed by, or sponsored by Blizzard Entertainment.
